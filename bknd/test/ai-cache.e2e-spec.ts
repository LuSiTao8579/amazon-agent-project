import { randomUUID } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { createClient } from '@redis/client';
import { AiCacheService } from '../src/ai/cache/ai-cache.service.js';
import { AI_CACHE_PREFIX, buildAiCacheKey, chatDimensionVersionKey, type AiCacheKey } from '../src/ai/cache/ai-cache-key.js';

describe('AI Redis 缓存服务', () => {
  let module: TestingModule;
  let cache: AiCacheService;
  let redis: ReturnType<typeof createClient>;
  let url: string;
  const userId = randomUUID();
  const id = randomUUID();
  const session = { kind: 'session', userId, sessionId: id } as const;
  const chat = { kind: 'chat', userId, dimension: 'orders:today:' + id, question: '今天有多少订单？' } as const;
  const otherDimension = 'orders%3Atoday:' + id;
  const task = { kind: 'taskState', userId, taskId: id } as const;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ envFilePath: ['.env.ai', '.env'] })],
      providers: [AiCacheService],
    }).compile();
    url = module.get(ConfigService).get<string>('REDIS_URL') ?? 'redis://127.0.0.1:16379/0';
    // 测试观察连接用于检查服务实际写入的值和 TTL。
    redis = createClient({ url, socket: { reconnectStrategy: false } });
    redis.on('error', () => {});
    await redis.connect();
    await module.init();
    cache = module.get(AiCacheService);
  });

  afterEach(async () => {
    if (redis?.isReady) {
      await cache.invalidate(chat);
      await redis.del([buildAiCacheKey(session), buildAiCacheKey(task), chatDimensionVersionKey(chat.dimension), chatDimensionVersionKey(otherDimension)]);
    }
  });

  afterAll(async () => {
    await module?.close();
    if (redis?.isOpen) redis.destroy();
  });

  it('会话 JSON 可往返，默认两小时过期，按用户精确失效', async () => {
    const value = [{ user: '问题', assistant: '答复', metadata: { complete: true } }];
    await cache.set(session, value);
    const name = `ai:session:${userId}:${id}`;
    expect(await redis.get(name)).toBe(JSON.stringify(value));
    const ttl = await redis.ttl(name);
    const configured = Number(module.get(ConfigService).get('AI_SESSION_CACHE_TTL_SECONDS') ?? 7200);
    expect(ttl).toBeGreaterThanOrEqual(configured - 1);
    expect(ttl).toBeLessThanOrEqual(configured);
    expect(await cache.get({ ...session, sessionId: id.toUpperCase() })).toEqual(value);
    const other = { ...session, userId: randomUUID() };
    expect(await cache.get(other)).toBeUndefined();
    expect(await cache.invalidate(other)).toBe(false);
    expect(await cache.invalidate(session)).toBe(true);
    expect(await cache.invalidate(session)).toBe(false);
    expect(await cache.get(session)).toBeUndefined();
  });

  it('聊天按用户、业务维度和问句区分，默认十分钟，允许显式覆盖 TTL', async () => {
    await cache.set(chat, null);
    const base = buildAiCacheKey(chat);
    expect(base).toMatch(new RegExp(`^ai:chat_cache:${userId}:orders%3Atoday%3A${id}:[a-f0-9]{64}$`));
    const name = base + ':' + await redis.get(chatDimensionVersionKey(chat.dimension));
    const ttl = await redis.ttl(name);
    expect(ttl).toBeGreaterThanOrEqual(599);
    expect(ttl).toBeLessThanOrEqual(600);
    expect(await cache.get(chat)).toBeNull();
    expect(await cache.get({ ...chat, userId: randomUUID() })).toBeUndefined();
    expect(await cache.get({ ...chat, dimension: otherDimension })).toBeUndefined();
    expect(await cache.get({ ...chat, question: '昨天有多少订单？' })).toBeUndefined();
    await cache.set(chat, '更新结果', 45);
    const updatedTtl = await redis.ttl(name);
    expect(updatedTtl).toBeLessThanOrEqual(45);
    expect(updatedTtl).toBeGreaterThanOrEqual(44);
  });

  it('任务状态必须指定 TTL，过期由 Redis 自动处理', async () => {
    await expect(cache.set(task, 'queued')).rejects.toThrow(RangeError);
    await cache.set(task, { status: 'queued' }, 1);
    expect(await redis.get(`ai:task_state:${userId}:${id}`)).toBe('{"status":"queued"}');
    await vi.waitFor(async () => expect(await cache.get(task)).toBeUndefined(), { timeout: 3000 });
  });

  it('拒绝无效输入和预留类别，损坏 JSON 可按未命中处理', async () => {
    for (const ttl of [0, -1, 0.5, Infinity]) {
      await expect(cache.set(session, 'value', ttl)).rejects.toThrow(RangeError);
    }
    await expect(cache.set(session, { value: NaN })).rejects.toThrow(TypeError);
    await expect(cache.set({ ...session, userId: '' }, 'value')).rejects.toThrow('登录用户');
    await expect(cache.get({ ...session, sessionId: '' })).rejects.toThrow('会话');
    expect(AI_CACHE_PREFIX.llm).toBe('ai:llm_cache:');
    await expect(cache.set({ ...session, kind: 'llm' } as unknown as AiCacheKey, 'value')).rejects.toThrow('未开放');
    expect(await redis.exists(buildAiCacheKey(session))).toBe(0);
    await redis.set(buildAiCacheKey(session), '{', { EX: 30 });
    expect(await cache.get(session)).toBeUndefined();
    await cache.set(session, false);
    expect(await cache.get(session)).toBe(false);
  });

  it('连接检查失败时应用仍可启动，读写和失效明确报告不可用', async () => {
    const invalidDatabase = new URL(url);
    invalidDatabase.pathname = '/2147483647';
    const unavailable = new AiCacheService(new ConfigService({ REDIS_URL: invalidDatabase.href }));
    try {
      await unavailable.onModuleInit();
      await expect(unavailable.get(session)).rejects.toThrow(ServiceUnavailableException);
      await expect(unavailable.set(session, 1)).rejects.toThrow(ServiceUnavailableException);
      await expect(unavailable.invalidate(session)).rejects.toThrow(ServiceUnavailableException);
    } finally {
      unavailable.onApplicationShutdown();
    }
  });

  it('应用关闭后释放连接，后续操作不能再使用该连接', async () => {
    const config = new ConfigService({ REDIS_URL: url, AI_SESSION_CACHE_TTL_SECONDS: '60' });
    const separate = await Test.createTestingModule({
      providers: [AiCacheService, { provide: ConfigService, useValue: config }],
    }).compile();
    const service = separate.get(AiCacheService);
    try {
      await separate.init();
      expect(await service.get(session)).toBeUndefined();
      await service.set(session, []);
      const ttl = await redis.ttl(buildAiCacheKey(session));
      expect(ttl).toBeLessThanOrEqual(60);
      expect(ttl).toBeGreaterThanOrEqual(59);
    } finally {
      await separate.close();
    }
    await expect(service.get(session)).rejects.toThrow(ServiceUnavailableException);
  });
});
