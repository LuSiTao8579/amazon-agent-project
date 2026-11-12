import { randomUUID } from 'node:crypto';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { createClient } from '@redis/client';
import { AiCacheModule } from '../src/ai/cache/ai-cache.module.js';
import { AiCacheService } from '../src/ai/cache/ai-cache.service.js';
import { buildAiCacheKey, chatDimensionVersionKey, type AiChatResultQuery } from '../src/ai/cache/ai-cache-key.js';

describe('可复用聊天查询（真实 Redis）', () => {
  const userId = randomUUID();
  const otherUser = randomUUID();
  const orders = 'orders:' + randomUUID();
  const inventory = 'inventory:' + randomUUID();
  const disabled = 'disabled:' + randomUUID();
  const query: AiChatResultQuery = {
    kind: 'chat', userId, dimension: orders, question: '还有多少？',
    conditions: { filters: { currency: 'CNY', warehouseId: 2 }, context: { sessionId: 's1', turnIds: ['a', 'b'] } },
  };
  let module: TestingModule;
  let cache: AiCacheService;
  let redis: ReturnType<typeof createClient>;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({
        isGlobal: true, envFilePath: ['.env.ai', '.env'],
        load: [() => ({ AI_CHAT_CACHE_POLICIES: JSON.stringify({
          [inventory]: { ttlSeconds: 1 }, [disabled]: { enabled: false },
        }) })],
      }), AiCacheModule],
    }).compile();
    await module.init();
    cache = module.get(AiCacheService);
    const url = module.get(ConfigService).get<string>('REDIS_URL') ?? 'redis://127.0.0.1:16379/0';
    redis = createClient({ url, socket: { reconnectStrategy: false } });
    redis.on('error', () => {});
    await redis.connect();
  });

  afterEach(async () => {
    if (!redis?.isReady) return;
    for (const id of [userId, otherUser]) {
      for await (const keys of redis.scanIterator({ MATCH: `ai:chat_cache:${id}:*` })) {
        if (keys.length) await redis.del(keys);
      }
    }
    await redis.del([orders, inventory, disabled].map(chatDimensionVersionKey));
  });

  afterAll(async () => {
    if (redis?.isOpen) redis.destroy();
    await module?.close();
  });

  it('仅相同条件命中，属性顺序不影响结果，默认有效期为 600 秒', async () => {
    const load = vi.fn(async () => ({ count: 5 }));
    expect(await cache.getOrLoadChat(query, load)).toEqual({ count: 5 });
    const equivalent = { ...query, conditions: {
      context: { turnIds: ['a', 'b'], sessionId: 's1' }, filters: { warehouseId: 2, currency: 'CNY' },
    } };
    expect(await cache.getOrLoadChat(equivalent, load)).toEqual({ count: 5 });
    expect(load).toHaveBeenCalledTimes(1);
    const ttl = await redis.ttl(buildAiCacheKey(query) + ':' + await redis.get(chatDimensionVersionKey(orders)));
    expect(ttl).toBeGreaterThanOrEqual(599);
    expect(ttl).toBeLessThanOrEqual(600);
    for (const different of [
      { ...query, userId: otherUser }, { ...query, dimension: inventory }, { ...query, question: '差多少？' },
      { ...equivalent, conditions: { ...equivalent.conditions, filters: { warehouseId: '2', currency: 'CNY' } } },
      { ...equivalent, conditions: { ...equivalent.conditions, context: { sessionId: 's2', turnIds: ['a', 'b'] } } },
      { ...equivalent, conditions: { ...equivalent.conditions, context: { sessionId: 's1', turnIds: ['b', 'a'] } } },
    ]) {
      expect(await cache.get(different)).toBeUndefined();
    }
  });

  it('禁用维度绕过读写，短 TTL 维度真实过期后再次查询', async () => {
    const load = vi.fn(async () => false);
    const off = { ...query, dimension: disabled };
    await cache.set(off, true);
    expect(await cache.get(off)).toBeUndefined();
    await cache.getOrLoadChat(off, load);
    await cache.getOrLoadChat(off, load);
    expect(load).toHaveBeenCalledTimes(2);
    expect(await redis.exists(chatDimensionVersionKey(disabled))).toBe(0);
    const short = { ...query, dimension: inventory };
    await cache.getOrLoadChat(short, load);
    expect(await cache.getOrLoadChat(short, load)).toBe(false);
    await vi.waitFor(async () => expect(await cache.get(short)).toBeUndefined(), { timeout: 3000 });
    await cache.getOrLoadChat(short, load);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('业务更新可让所有受影响用户和条件失效，其他维度仍命中', async () => {
    const another = { ...query, userId: otherUser, conditions: {} };
    const different = { ...query, conditions: {} };
    const unaffected = { ...query, dimension: inventory };
    for (const key of [query, another, different, unaffected]) await cache.set(key, 0, 30);
    expect(await cache.invalidate(query)).toBe(true);
    for (const key of [another, different, unaffected]) expect(await cache.get(key)).toBe(0);
    await cache.invalidateChatDimension(orders);
    expect(await cache.get(another)).toBeUndefined();
    expect(await cache.get(different)).toBeUndefined();
    expect(await cache.get(unaffected)).toBe(0);
  });

  it('关闭维度时绕过已有结果，也能通知其他后端实例失效', async () => {
    const peer = new AiCacheService(new ConfigService({
      REDIS_URL: module.get(ConfigService).get<string>('REDIS_URL'), AI_CHAT_CACHE_POLICIES: '{}',
    }));
    const off = { ...query, dimension: disabled };
    try {
      await peer.onModuleInit();
      await peer.set(off, '已有结果');
      expect(await cache.get(off)).toBeUndefined();
      expect(await cache.getOrLoadChat(off, async () => '实时结果')).toBe('实时结果');
      expect(await peer.get(off)).toBe('已有结果');
      await cache.invalidateChatDimension(disabled);
      expect(await peer.get(off)).toBeUndefined();
    } finally { peer.onApplicationShutdown(); }
  });

  it.each(['单个查询', '业务维度'])('%s 失效后，已开始的慢查询不能覆盖新结果', async scope => {
    let started!: () => void;
    let finish!: (value: string) => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    const slowValue = new Promise<string>(resolve => { finish = resolve; });
    const slow = cache.getOrLoadChat(query, () => { started(); return slowValue; });
    await entered;
    try {
      if (scope === '业务维度') await cache.invalidateChatDimension(orders);
      else await cache.invalidate(query);
      expect(await cache.getOrLoadChat(query, async () => '新结果')).toBe('新结果');
    } finally { finish('旧结果'); }
    expect(await slow).toBe('旧结果');
    expect(await cache.get(query)).toBe('新结果');
  });

  it('失败的业务查询可重试，JSON null 是有效命中，Redis 离线时查询仍可执行', async () => {
    const error = new Error('查询失败');
    await expect(cache.getOrLoadChat(query, () => Promise.reject(error))).rejects.toBe(error);
    expect(await cache.get(query)).toBeUndefined();
    const load = vi.fn(async () => null);
    await cache.getOrLoadChat(query, load);
    expect(await cache.getOrLoadChat(query, load)).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
    const offline = new AiCacheService(new ConfigService());
    expect(await offline.getOrLoadChat(query, async () => 8)).toBe(8);
    await expect(offline.getOrLoadChat(query, () => Promise.reject(error))).rejects.toBe(error);
  });

  it('配置和值类型有误时给出明确错误', async () => {
    for (const config of ['[]', '{', '{"orders":{"enabled":"false"}}', '{"orders":{"ttlSeconds":0}}', '{"orders":{"ttl":10}}']) {
      expect(() => new AiCacheService(new ConfigService({ AI_CHAT_CACHE_POLICIES: config }))).toThrow('AI_CHAT_CACHE_POLICIES');
    }
    const load = vi.fn(async () => 0);
    await expect(cache.getOrLoadChat({ ...query, conditions: { page: NaN } }, load)).rejects.toThrow('JSON');
    expect(load).not.toHaveBeenCalled();
  });
});
