import type { ToolResult } from '../../../../contracts/tool-result.js';

type AuditValue = null | boolean | number | string | AuditValue[] | { [key: string]: AuditValue };
const masked = '[REDACTED]';
// 自由文本可能在任意层携带联系方式或金额。只保留已知枚举和分页、等级数值。
const enums: Record<string, readonly string[]> = {
  roles: ['Member', 'Manager', 'Analyst'], status: ['active', 'inactive'], sortOrder: ['asc', 'desc'],
  sortBy: ['name', 'email', 'role', 'status', 'createdAt', 'companyCode', 'companyName', 'level', 'country',
    'city', 'foundedYear', 'annualRevenue', 'employees', 'revenuePerEmployee'],
};
const numberLimits: Record<string, number> = { page: 1000000, pageSize: 100, levels: 100 };
// JSON 属性名也来自模型输入。只保留固定的诊断字段名，未知字段整项遮盖。
const maskedFields = new Set([
  'search', 'country', 'city', 'userId', 'foundedYearFrom', 'foundedYearTo', 'view', 'charts',
  'email', 'phone', 'contact', 'annual_revenue', 'annualRevenue', 'revenuePerEmployee', 'totalRevenue',
  'password', 'token',
]);
const groups = new Set(['filters', 'metrics']);
const knownFields = new Set([...Object.keys(enums), ...Object.keys(numberLimits), ...maskedFields, ...groups, 'isAdmin']);

export function redactToolArgs(args: unknown, kind: 'read' | 'write' = 'read'): AuditValue {
  let remaining = 200;
  function visit(value: unknown, field: string, depth: number): AuditValue {
    if (--remaining < 0 || depth > 8) return '[TRUNCATED]';
    if (depth > 0 && (!knownFields.has(field) || maskedFields.has(field))) return masked;
    if (value === null || (field === 'isAdmin' && typeof value === 'boolean')) return value;
    if (Array.isArray(value)) {
      const items: AuditValue[] = [];
      for (const item of value) {
        if (remaining <= 0) { items.push('[TRUNCATED]'); break; }
        items.push(visit(item, field, depth + 1));
      }
      return items;
    }
    if (typeof value === 'object') {
      if (depth > 0 && !groups.has(field)) return masked;
      const result: Record<string, AuditValue> = Object.create(null);
      let index = 0;
      for (const key in value) {
        if (!Object.hasOwn(value, key)) continue;
        // 写入提案可能含有效的账号密码；审计副本完全省略凭据字段。
        if (kind === 'write' && key === 'password') continue;
        if (remaining <= 0) { result.truncated = true; break; }
        const label = knownFields.has(key) ? key : `field_${index}`;
        index++;
        result[label] = visit((value as Record<string, unknown>)[key], key, depth + 1);
      }
      return result;
    }
    if (typeof value === 'string' && Object.hasOwn(enums, field) && enums[field].includes(value)) return value;
    if (typeof value === 'number' && Object.hasOwn(numberLimits, field) &&
      Number.isInteger(value) && value >= 1 && value <= numberLimits[field]) return value;
    return masked;
  }
  return visit(args, '', 0);
}

export function summarizeToolResult(result: ToolResult) {
  const summary = { code: result.code, resultType: result.resultType };
  if (result.code === 'OK' && result.resultType === 'table') {
    return { ...summary, returnedCount: result.data.items.length, total: result.data.total };
  }
  if (result.code === 'OK' && result.resultType === 'chart') return { ...summary, returnedCount: result.data.rows.length };
  return summary;
}
export type ToolAuditInput = ReturnType<typeof redactToolArgs>;
export type ToolAuditSummary = ReturnType<typeof summarizeToolResult>;
