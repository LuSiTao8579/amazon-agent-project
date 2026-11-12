import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@redis/client';
import { buildAiCacheKey, cacheTtlSeconds, type AiCacheKey } from './ai-cache-key.js';

export type AiCacheValue = null | boolean | number | string | AiCacheValue[] | { [key: string]: AiCacheValue };

const localRedisUrl = 'redis://127.0.0.1:16379/0';
const timeoutMs = 2000;

@Injectable()
export class AiCacheService implements OnModuleInit, OnApplicationShutdown {
  private readonly client;
  private readonly sessionTtlSeconds: number;
  private readonly logger = new Logger(AiCacheService.name);
  private outageLogged = false;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const ttl = config.get<string>('AI_SESSION_CACHE_TTL_SECONDS');
    this.sessionTtlSeconds = cacheTtlSeconds('session', ttl === undefined ? undefined : Number(ttl));
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

  async get(key: AiCacheKey): Promise<AiCacheValue | undefined> {
    const raw = await this.command(this.client.get(buildAiCacheKey(key)));
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as AiCacheValue;
    } catch {
      this.logger.warn(`忽略无法解析的 AI 缓存（${key.kind}）`);
      return undefined;
    }
  }

  async set(key: AiCacheKey, value: AiCacheValue,
    ttlSeconds = key.kind === 'session' ? this.sessionTtlSeconds : undefined): Promise<void> {
    const name = buildAiCacheKey(key);
    const expiration = cacheTtlSeconds(key.kind, ttlSeconds);
    const json = JSON.stringify(value, (_field, item: unknown) => {
      if (item === undefined || (typeof item === 'number' && !Number.isFinite(item))) {
        throw new TypeError('AI 缓存值必须是有效 JSON');
      }
      return item;
    });
    await this.command(this.client.set(name, json, { expiration: { type: 'EX', value: expiration } }));
  }

  async invalidate(key: AiCacheKey): Promise<boolean> {
    return (await this.command(this.client.del(buildAiCacheKey(key)))) > 0;
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
