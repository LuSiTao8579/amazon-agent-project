import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { AiCacheKey } from './ai-cache-key.js';
import { AiCacheService, type AiCacheValue } from './ai-cache.service.js';

export const SESSION_TURN_LIMIT = 10;
export type SessionTurn = { turnId: string; user: string; assistant: string };
type SessionKey = Extract<AiCacheKey, { kind: 'session' }>;

function matchesHistory(value: AiCacheValue | undefined, ids: string[]): value is SessionTurn[] {
  return Array.isArray(value) && value.length === ids.length && value.every((turn, index) =>
    turn !== null && typeof turn === 'object' && !Array.isArray(turn) &&
    turn.turnId === ids[index] && typeof turn.user === 'string' && typeof turn.assistant === 'string');
}

/** 调用方持有 PostgreSQL 会话锁，覆盖回源、对话提交和缓存更新。 */
@Injectable()
export class AiSessionContextCache {
  constructor(@Inject(AiCacheService) private readonly cache: AiCacheService) {}

  async read(key: SessionKey, turnIds: string[], load: () => Promise<SessionTurn[]>): Promise<SessionTurn[]> {
    const cached = await this.bestEffort(this.cache.get(key));
    if (matchesHistory(cached, turnIds)) return cached;
    const turns = await load();
    await this.store(key, turns);
    return turns;
  }

  async store(key: SessionKey, turns: SessionTurn[]): Promise<void> {
    await this.bestEffort(this.cache.set(key, turns.slice(-SESSION_TURN_LIMIT)));
  }

  async clear(userId: string, sessionId: string): Promise<void> {
    await this.bestEffort(this.cache.invalidate({ kind: 'session', userId, sessionId }));
  }

  private async bestEffort<T>(operation: Promise<T>): Promise<T | undefined> {
    try {
      return await operation;
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException)) throw error;
      return undefined;
    }
  }
}
