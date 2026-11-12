import { createHash } from 'node:crypto';
import { requireAiResourceId, requireAiUserId } from '../services/ai-access.js';

export const AI_CACHE_PREFIX = {
  session: 'ai:session:',
  chat: 'ai:chat_cache:',
  llm: 'ai:llm_cache:',
  taskState: 'ai:task_state:',
} as const;

export type AiCacheValue = null | boolean | number | string | AiCacheValue[] | { [key: string]: AiCacheValue };
type ChatConditions = Record<string, AiCacheValue>;
export type AiChatCacheKey = { kind: 'chat'; userId: string; dimension: string; question: string; conditions?: ChatConditions };
export type AiChatResultQuery = AiChatCacheKey & { conditions: ChatConditions };

// llm 只预留前缀，不接受该类别的读写。
export type AiCacheKey =
  | { kind: 'session'; userId: string; sessionId: string }
  | AiChatCacheKey
  | { kind: 'taskState'; userId: string; taskId: string };

const defaultTtlSeconds = { session: 7200, chat: 600, taskState: undefined };

export function cacheTtlSeconds(kind: AiCacheKey['kind'], override = defaultTtlSeconds[kind]): number {
  if (typeof override !== 'number' || !Number.isSafeInteger(override) || override <= 0) {
    throw new RangeError('AI 缓存 TTL 必须是正整数秒，任务状态需要显式指定 TTL');
  }
  return override;
}

// 对象属性按键名排序，数组顺序和 JSON 值类型参与计算。
function canonicalJson(value: AiCacheValue): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + Array.from(value, canonicalJson).join(',') + ']';
  if (typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError('聊天缓存条件必须使用 JSON 值');
  }
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
}

export function chatDimensionVersionKey(dimension: string): string {
  if (!dimension?.trim()) throw new TypeError('聊天缓存需要业务维度');
  return AI_CACHE_PREFIX.chat + 'version:' + encodeURIComponent(dimension);
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
      if (key.conditions !== undefined && (key.conditions === null || typeof key.conditions !== 'object' || Array.isArray(key.conditions))) {
        throw new TypeError('聊天缓存条件必须是 JSON 对象');
      }
      const digest = createHash('sha256').update(canonicalJson([key.question, key.conditions ?? {}])).digest('hex');
      return AI_CACHE_PREFIX.chat + userId + ':' + encodeURIComponent(key.dimension) + ':' + digest;
    }
    default:
      throw new TypeError('未开放的 AI 缓存类别');
  }
}
