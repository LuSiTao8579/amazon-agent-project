import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@redis/client';
import { randomUUID } from 'node:crypto';
import { buildAiCacheKey, cacheTtlSeconds, chatDimensionVersionKey, type AiCacheKey, type AiCacheValue, type AiChatResultQuery } from './ai-cache-key.js';
import { parseChatCachePolicies } from './ai-chat-cache-policy.js';

export type { AiCacheValue } from './ai-cache-key.js';

const localRedisUrl = 'redis://127.0.0.1:16379/0';
const timeoutMs = 2000;
const pendingPrefix = 'pending:';
// 只有读取时的占位值仍在，才发布本次查询结果。精确删除或其他写入都会撤销此次发布。
const publishChatResult = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
  end
  return nil`;

function encodeValue(value: AiCacheValue): string {
  return JSON.stringify(value, (_field, item: unknown) => {
    if (item === undefined || (typeof item === 'number' && !Number.isFinite(item))) {
      throw new TypeError('AI 缓存值必须是有效 JSON');
    }
    return item;
  });
}

@Injectable()
export class AiCacheService implements OnModuleInit, OnApplicationShutdown {
  private readonly client;
  private readonly sessionTtlSeconds: number;
  private readonly chatPolicies;
  private readonly logger = new Logger(AiCacheService.name);
  private outageLogged = false;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const ttl = config.get<string>('AI_SESSION_CACHE_TTL_SECONDS');
    this.sessionTtlSeconds = cacheTtlSeconds('session', ttl === undefined ? undefined : Number(ttl));
    this.chatPolicies = parseChatCachePolicies(config.get<string>('AI_CHAT_CACHE_POLICIES'));
    try {
      const url = new URL(config.get<string>('REDIS_URL') ?? localRedisUrl);
      if (!url.hostname || !/^\/(?:\d+)?$/.test(url.pathname || '/')) throw new TypeError();
      this.client = createClient({
        url: url.href,
        socket: { connectTimeout: timeoutMs },
        disableOfflineQueue: true,
        commandOptions: { timeout: timeoutMs },
      });
    } catch {
      throw new Error('请检查 bknd/.env 中的 REDIS_URL');
    }
    this.client.on('error', () => this.logUnavailable());
    this.client.on('ready', () => {
      this.outageLogged = false;
      this.logger.log('AI Redis 已连接');
    });
  }

  async onModuleInit() {
    try {
      await this.command(this.client.connect().then(() => this.client.ping()));
    } catch {
      // 缓存是可选依赖。客户端继续重连，已有数据库接口可以启动。
      this.logUnavailable();
    }
  }

  onApplicationShutdown() {
    if (this.client.isOpen) this.client.destroy();
  }

  private decodeValue(kind: AiCacheKey['kind'], raw: string | null): AiCacheValue | undefined {
    if (raw === null || (kind === 'chat' && raw.startsWith(pendingPrefix))) return undefined;
    try {
      return JSON.parse(raw) as AiCacheValue;
    } catch {
      this.logger.warn(`忽略无法解析的 AI 缓存（${kind}）`);
      return undefined;
    }
  }

  private ttl(key: AiCacheKey, override?: number): number {
    if (override !== undefined) return cacheTtlSeconds(key.kind, override);
    if (key.kind === 'session') return this.sessionTtlSeconds;
    if (key.kind === 'chat') return cacheTtlSeconds('chat', this.chatPolicies.get(key.dimension)?.ttlSeconds);
    return cacheTtlSeconds(key.kind);
  }

  private async storageKey(key: AiCacheKey, invalidating = false): Promise<string | undefined> {
    const base = buildAiCacheKey(key);
    if (key.kind !== 'chat') return base;
    const versionKey = chatDimensionVersionKey(key.dimension);
    if (invalidating) {
      const current = await this.command(this.client.get(versionKey));
      return current === null ? undefined : base + ':' + current;
    }
    if (this.chatPolicies.get(key.dimension)?.enabled === false) return undefined;
    // Redis 7 的 SET NX GET 原子取得或建立维度版本，各进程共享。
    const candidate = randomUUID();
    const current = await this.command(this.client.set(versionKey, candidate, { condition: 'NX', GET: true }));
    return base + ':' + (current ?? candidate);
  }

  async get(key: AiCacheKey): Promise<AiCacheValue | undefined> {
    const name = await this.storageKey(key);
    return name === undefined ? undefined : this.decodeValue(key.kind, await this.command(this.client.get(name)));
  }

  async set(key: AiCacheKey, value: AiCacheValue, ttlSeconds?: number): Promise<void> {
    const name = await this.storageKey(key);
    if (name === undefined) return;
    const expiration = this.ttl(key, ttlSeconds);
    await this.command(this.client.set(name, encodeValue(value), { expiration: { type: 'EX', value: expiration } }));
  }

  async invalidate(key: AiCacheKey): Promise<boolean> {
    const name = await this.storageKey(key, true);
    return name !== undefined && (await this.command(this.client.del(name))) > 0;
  }

  /** 数据提交后调用。使所有用户在该业务维度下的旧结果失效。 */
  async invalidateChatDimension(dimension: string): Promise<void> {
    await this.command(this.client.del(chatDimensionVersionKey(dimension)));
  }

  /** 仅用于可复用的业务查询。业务异常原样抛出；缓存不可用时仍执行查询。 */
  async getOrLoadChat(query: AiChatResultQuery, load: () => Promise<AiCacheValue>): Promise<AiCacheValue> {
    if (query.kind !== 'chat' || query.conditions === undefined) throw new TypeError('可复用聊天查询需要显式传入 conditions');
    const ttl = this.ttl(query);
    let name: string | undefined;
    let expected: string | undefined;
    try {
      name = await this.storageKey(query);
      if (name !== undefined) {
        const marker = pendingPrefix + randomUUID();
        const previous = await this.command(this.client.set(name, marker, {
          condition: 'NX', GET: true, expiration: { type: 'EX', value: ttl },
        }));
        const hit = this.decodeValue('chat', previous);
        if (hit !== undefined) return hit;
        expected = previous ?? marker;
      }
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException)) throw error;
    }

    const value = await load();
    if (name !== undefined && expected !== undefined) {
      try {
        await this.command(this.client.eval(publishChatResult, {
          keys: [name], arguments: [expected, encodeValue(value), String(ttl)],
        }));
      } catch (error) {
        if (!(error instanceof ServiceUnavailableException)) throw error;
      }
    }
    return value;
  }

  private logUnavailable() {
    if (!this.outageLogged) this.logger.warn('AI Redis 暂不可用，请检查 Redis 服务和 REDIS_URL');
    this.outageLogged = true;
  }

  private async command<T>(operation: Promise<T>): Promise<T> {
    // 即使命令已发出但 Redis 尚未应答，调用方的等待时间也有上限。
    let timer: NodeJS.Timeout | undefined;
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Redis timeout')), timeoutMs);
      });
      return await Promise.race([operation, deadline]);
    } catch {
      throw new ServiceUnavailableException('AI 缓存暂不可用');
    } finally {
      clearTimeout(timer);
    }
  }
}
