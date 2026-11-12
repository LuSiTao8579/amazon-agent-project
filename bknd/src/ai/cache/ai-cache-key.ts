import { createHash } from 'node:crypto';
import { requireAiResourceId, requireAiUserId } from '../services/ai-access.js';

export const AI_CACHE_PREFIX = {
  session: 'ai:session:',
  chat: 'ai:chat_cache:',
  llm: 'ai:llm_cache:',
  taskState: 'ai:task_state:',
} as const;

// llm 只预留前缀，不接受该类别的读写。
export type AiCacheKey =
  | { kind: 'session'; userId: string; sessionId: string }
  | { kind: 'chat'; userId: string; dimension: string; question: string }
  | { kind: 'taskState'; userId: string; taskId: string };

const defaultTtlSeconds = { session: 7200, chat: 600, taskState: undefined };

export function cacheTtlSeconds(key: AiCacheKey, override = defaultTtlSeconds[key.kind]): number {
  if (typeof override !== 'number' || !Number.isSafeInteger(override) || override <= 0) {
    throw new RangeError('AI 缓存 TTL 必须是正整数秒，任务状态需要显式指定 TTL');
  }
  return override;
}

export function buildAiCacheKey(key: AiCacheKey): string {
  requireAiUserId(key.userId);
  const userId = key.userId.toLowerCase();
  switch (key.kind) {
    case 'session':
      requireAiResourceId(key.sessionId, '会话');
      return AI_CACHE_PREFIX.session + userId + ':' + key.sessionId.toLowerCase();
    case 'taskState':
      requireAiResourceId(key.taskId, '任务');
      return AI_CACHE_PREFIX.taskState + userId + ':' + key.taskId.toLowerCase();
    case 'chat': {
      if (!key.dimension?.trim() || !key.question?.trim()) {
        throw new TypeError('聊天缓存需要业务维度和问句');
      }
      const digest = createHash('sha256').update(key.question).digest('hex');
      return AI_CACHE_PREFIX.chat + userId + ':' + encodeURIComponent(key.dimension) + ':' + digest;
    }
    default:
      throw new TypeError('未开放的 AI 缓存类别');
  }
}
