import { cacheTtlSeconds } from './ai-cache-key.js';

export type ChatCachePolicy = { enabled: boolean; ttlSeconds: number };

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseChatCachePolicies(raw?: string): ReadonlyMap<string, ChatCachePolicy> {
  const policies = new Map<string, ChatCachePolicy>();
  if (raw === undefined) return policies;
  try {
    const config: unknown = JSON.parse(raw);
    if (!isObject(config)) throw new TypeError();
    for (const [dimension, rule] of Object.entries(config)) {
      if (!dimension.trim() || !isObject(rule) ||
          Object.keys(rule).some(field => field !== 'enabled' && field !== 'ttlSeconds') ||
          (rule.enabled !== undefined && typeof rule.enabled !== 'boolean') ||
          (rule.ttlSeconds !== undefined && typeof rule.ttlSeconds !== 'number')) throw new TypeError();
      policies.set(dimension, { enabled: rule.enabled ?? true, ttlSeconds: cacheTtlSeconds('chat', rule.ttlSeconds) });
    }
  } catch {
    throw new Error('AI_CHAT_CACHE_POLICIES 必须按业务维度配置 enabled（布尔值）和 ttlSeconds（正整数秒）');
  }
  return policies;
}
