export const AI_DATA_SOURCE = 'ai';
// 预留 action 前缀标识客户端自行上报的审计事件。
export const AI_AUDIT_CLIENT_PREFIX = 'client.';
export const AI_AUDIT_CLIENT_ACTION_MAX_LENGTH = 100 - AI_AUDIT_CLIENT_PREFIX.length;

/** 与 0007_ai_foundation.sql 的 CHECK 约束保持一致。 */
export const AI_SESSION_STATUSES = ['active', 'closed'] as const;
export const AI_TASK_STATUSES = ['pending', 'running', 'completed', 'failed', 'cancelled'] as const;
export const AI_AUDIT_RESULTS = ['success', 'failure'] as const;

export type AiSessionStatus = (typeof AI_SESSION_STATUSES)[number];
export type AiTaskStatus = (typeof AI_TASK_STATUSES)[number];
export type AiAuditResult = (typeof AI_AUDIT_RESULTS)[number];
