import type { ChatMessage } from './types';
import { MAX_ATTACHMENT_BYTES } from './upload-policy.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 后端响应是不可信的外部数据，只把渲染所需的字段传给浏览器。 */
export function normalizeMessage(row: unknown): ChatMessage {
  if (!isRecord(row) || typeof row.id !== 'string' || (row.role !== 'user' && row.role !== 'assistant')) {
    throw new Error('消息格式错误');
  }
  const base = {
    id: row.id,
    role: row.role,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : null,
    turnStatus: row.turnStatus === 'pending' || row.turnStatus === 'completed' || row.turnStatus === 'failed'
      ? row.turnStatus : null,
  } as const;
  const attachments = Array.isArray(row.attachments) ? row.attachments.flatMap((item: unknown) => {
    if (!isRecord(item) || typeof item.id !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(item.id) ||
      typeof item.name !== 'string' || item.name.length > 200) return [];
    const size = Number(item.size);
    return Number.isSafeInteger(size) && size > 0 && size <= MAX_ATTACHMENT_BYTES ? [{ id: item.id, name: item.name, size }] : [];
  }).slice(0, 10) : [];
  const withAttachments = attachments.length ? { ...base, attachments } : base;
  const content = isRecord(row.content) ? row.content : {};
  if (row.messageType === 'text') {
    return typeof content.text === 'string'
      ? { ...withAttachments, type: 'text', content: { text: content.text } }
      : { ...base, type: 'unsupported', content: { reason: '文本消息格式不正确，暂时无法显示。' } };
  }
  if (row.messageType === 'table' || row.messageType === 'chart' || row.messageType === 'report' || row.messageType === 'confirmation') {
    const title = typeof content.title === 'string' ? content.title.slice(0, 100) : null;
    return { ...base, type: row.messageType, content: { title } };
  }
  return { ...base, type: 'unsupported', content: { reason: '暂不支持显示此类型的消息。' } };
}
