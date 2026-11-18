import type { ToolErrorCode } from '../../../../contracts/tool-result.d.ts';
import type { ChatMessage } from './types';
import { MAX_ATTACHMENT_BYTES } from './upload-policy.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const toolErrors: Record<ToolErrorCode, true> = {
  INVALID_ARGUMENTS: true, UNAUTHENTICATED: true, FORBIDDEN: true, TOOL_UNAVAILABLE: true, EXECUTION_FAILED: true,
};

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
  if (row.role === 'assistant' && 'code' in content) {
    const invalid = { ...base, type: 'unsupported', content: { reason: '工具结果格式不正确，暂时无法显示。' } } as const;
    const { data, resultType, code, message } = content;
    if (resultType !== row.messageType || typeof message !== 'string' || !message.trim()) return invalid;
    if (code !== 'OK') {
      if (typeof code !== 'string' || !Object.hasOwn(toolErrors, code) || data !== null || resultType !== 'text') return invalid;
      return { ...base, type: 'tool-error', content: { message: message.slice(0, 300) } };
    }
    if (!isRecord(data)) return invalid;
    if (resultType === 'text' && typeof data.text === 'string') return { ...base, type: 'text', content: { text: data.text } };
    if (resultType === 'table') {
      const { tableType, items, total, page, pageSize } = data;
      if ((tableType !== 'companies' && tableType !== 'users') || !Array.isArray(items) ||
        typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0 ||
        typeof page !== 'number' || !Number.isSafeInteger(page) || page < 1 ||
        typeof pageSize !== 'number' || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 ||
        items.length > pageSize || items.length > total) return invalid;
      const title = tableType === 'users' ? '用户表' : '公司表';
      const summary = total === 0 ? '没有符合条件的记录。' : `共 ${total} 条，第 ${page} 页显示 ${items.length} 条。`;
      return { ...base, type: 'table', content: { title, summary } };
    }
    if (resultType === 'chart' && Array.isArray(data.rows)) {
      const title = data.chartType === 'yearlyGrowth' ? '公司成立年份累计趋势' :
        data.chartType === 'levelDistribution' ? '公司等级分布' : null;
      if (title) return { ...base, type: 'chart', content: { title, summary: `共 ${data.rows.length} 个数据点。` } };
    }
    if (resultType === 'report' && isRecord(data.summary) && Array.isArray(data.levelDistribution) && Array.isArray(data.yearlyGrowth)) {
      const count = data.summary.companyCount;
      if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0)
        return { ...base, type: 'report', content: { title: 'Dashboard', summary: `统计范围内共有 ${count} 家公司。` } };
    }
    return invalid;
  }
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
