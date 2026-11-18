import type { CompanyRow, ToolErrorCode, UserRow } from '../../../../contracts/tool-result.d.ts';
import type { ChatMessage } from './types';
import { MAX_ATTACHMENT_BYTES } from './upload-policy.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function companyRows(items: unknown[]): CompanyRow[] | null {
  const rows: CompanyRow[] = [];
  const codes = new Set<string>();
  for (const item of items) {
    if (!isRecord(item)) return null;
    const { companyCode, companyName, level, country, revenuePerEmployee, city, foundedYear, annualRevenue, employees } = item;
    if (typeof companyCode !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(companyCode) || codes.has(companyCode) ||
      typeof companyName !== 'string' || typeof country !== 'string' || typeof city !== 'string' ||
      typeof level !== 'number' || !Number.isInteger(level) || typeof foundedYear !== 'number' || !Number.isInteger(foundedYear) ||
      typeof employees !== 'number' || !Number.isSafeInteger(employees) || employees < 0 ||
      typeof annualRevenue !== 'number' || !Number.isFinite(annualRevenue) ||
      (revenuePerEmployee !== null && (typeof revenuePerEmployee !== 'number' || !Number.isFinite(revenuePerEmployee)))) return null;
    codes.add(companyCode);
    rows.push({ companyCode, companyName, level, country, revenuePerEmployee, city, foundedYear, annualRevenue, employees });
  }
  return rows;
}

function userRows(items: unknown[]): UserRow[] | null {
  const users: UserRow[] = [];
  for (const item of items) {
    if (!isRecord(item)) return null;
    const { name, email, role, status } = item;
    if (typeof name !== 'string' || typeof email !== 'string' || typeof role !== 'string' ||
      (status !== 'active' && status !== 'inactive')) return null;
    users.push({ name, email, role, status });
  }
  return users;
}

// 对历史图表只读取协议中的数值列，其他字段不进入浏览器。
function numericFields<K extends string>(value: unknown, keys: readonly K[]): Record<K, number> | null {
  if (!isRecord(value)) return null;
  const result = {} as Record<K, number>;
  for (const key of keys) {
    const field = value[key];
    if (typeof field !== 'number' || !Number.isFinite(field)) return null;
    result[key] = field;
  }
  return result;
}

function numericRows<K extends string>(value: unknown, keys: readonly K[]) {
  if (!Array.isArray(value)) return null;
  const rows: Record<K, number>[] = [];
  for (const item of value) {
    const row = numericFields(item, keys);
    if (!row) return null;
    rows.push(row);
  }
  return rows;
}
const levelFields = ['level', 'count', 'percentage'] as const;
const yearFields = ['year', 'newCompanies', 'cumulativeCompanies'] as const;

function isCount(value: number): boolean { return Number.isSafeInteger(value) && value >= 0; }

function readLevels(value: unknown) {
  const rows = numericRows(value, levelFields);
  if (!rows || !rows.every(row => Number.isInteger(row.level) && row.level > 0 && isCount(row.count) &&
    row.percentage >= 0 && row.percentage <= 100) || new Set(rows.map(row => row.level)).size !== rows.length) return null;
  return rows;
}

function readYears(value: unknown) {
  const rows = numericRows(value, yearFields);
  if (!rows || !rows.every((row, index) => Number.isInteger(row.year) && row.year >= 1 && row.year <= 9999 &&
    isCount(row.newCompanies) && isCount(row.cumulativeCompanies) && row.cumulativeCompanies >= row.newCompanies &&
    (index === 0 || row.year > rows[index - 1].year))) return null;
  return rows;
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
  if (row.role === 'assistant' && ('code' in content || 'resultType' in content)) {
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
        items.length > pageSize || items.length > Math.max(0, total - (page - 1) * pageSize)) return invalid;
      const title = tableType === 'users' ? '用户表' : '公司表';
      const pageSummary = `共 ${total} 条，第 ${page} 页显示 ${items.length} 条，每页 ${pageSize} 条。`;
      const summary = total === 0 ? `没有符合条件的记录。${pageSummary}` : pageSummary;
      const paging = { title, summary, total, page, pageSize };
      if (tableType === 'companies') {
        const companies = companyRows(items);
        return companies ? { ...base, type: 'table', content: { ...paging, tableType, companies } } : invalid;
      }
      const users = userRows(items);
      return users ? { ...base, type: 'table', content: { ...paging, tableType, users } } : invalid;
    }
    if (resultType === 'chart' && Array.isArray(data.rows)) {
      const summary = `共 ${data.rows.length} 个数据点。`;
      if (data.chartType === 'yearlyGrowth') {
        const rows = readYears(data.rows);
        if (rows) return { ...base, type: 'chart', content: { title: '公司成立年份累计趋势', summary, chart: { chartType: data.chartType, rows } } };
      }
      if (data.chartType === 'levelDistribution') {
        const rows = readLevels(data.rows);
        if (rows) return { ...base, type: 'chart', content: { title: '公司等级分布', summary, chart: { chartType: data.chartType, rows } } };
      }
    }
    if (resultType === 'report') {
      const summary = numericFields(data.summary, ['companyCount', 'totalRevenue', 'countryCount', 'employeeCount']);
      if (!summary || ![summary.companyCount, summary.countryCount, summary.employeeCount].every(isCount) ||
          summary.totalRevenue < 0) return invalid;
      const levelDistribution = data.levelDistribution === undefined ? undefined : readLevels(data.levelDistribution);
      const yearlyGrowth = data.yearlyGrowth === undefined ? undefined : readYears(data.yearlyGrowth);
      if (levelDistribution === null || yearlyGrowth === null) return invalid;
      return { ...base, type: 'report', content: { title: 'Dashboard', summary: `统计范围内共有 ${summary.companyCount} 家公司。`,
        report: { summary, ...(levelDistribution && { levelDistribution }), ...(yearlyGrowth && { yearlyGrowth }) } } };
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
    if (row.messageType === 'confirmation') return { ...base, type: 'confirmation', content: { title } };
    return { ...base, type: 'legacy', content: { title, kind: row.messageType } };
  }
  return { ...base, type: 'unsupported', content: { reason: '暂不支持显示此类型的消息。' } };
}
