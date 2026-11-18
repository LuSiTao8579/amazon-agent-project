import { COMPANY_SORT_COLUMNS } from '../../companies/company.dto.js';
import { USER_ROLES, USER_SORT_COLUMNS, USER_STATUSES } from '../../users/user-management.dto.js';

const paging = {
  page: { type: 'integer', minimum: 1, maximum: 1000000 },
  pageSize: { type: 'integer', minimum: 1, maximum: 100 },
  sortOrder: { type: 'string', enum: ['asc', 'desc'] },
};
const schemas = {
  query_companies: {
    description: '查询公司列表。公司名称按关键词搜索，多个等级满足其一。国家和城市为完整名称，英国使用 UK。',
    properties: { ...paging, search: { type: 'string', description: '公司名称关键词' },
      sortBy: { type: 'string', enum: Object.keys(COMPANY_SORT_COLUMNS) },
      country: { type: 'string' }, city: { type: 'string' },
      levels: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 100 } } },
  },
  query_users: {
    description: '查询用户列表，支持姓名关键词、多岗位和账号状态组合筛选、排序及分页。',
    properties: { ...paging, search: { type: 'string', description: '姓名关键词' },
      sortBy: { type: 'string', enum: Object.keys(USER_SORT_COLUMNS) },
      status: { type: 'string', enum: USER_STATUSES, description: '启用为 active，停用为 inactive' },
      roles: { type: 'array', items: { type: 'string', enum: USER_ROLES } } },
  },
  dashboard_metrics: { description: '获取全部公司的 Dashboard 汇总指标、等级占比和成立年份趋势。', properties: {} },
};
export type ChatToolName = keyof typeof schemas;
const chatToolNames = Object.keys(schemas) as ChatToolName[];
export const toolInstructions = '普通对话直接回答。用户请求业务数据时，按查询对象选择一个工具。缺少查询对象时先问要查公司、用户还是 Dashboard。没有合适的可用工具时说明无法查询。仅传用户指定的业务条件。若条件无法由工具表达，说明限制并请用户确认。前 N 家用 pageSize，按公司名称排序用 companyName。禁止编造查询结果或身份参数。';

// 对象明确的列表查询收窄模型可选工具；统计、解释和上下文追问由模型结合历史判断。
export function candidateTools(text: string): readonly ChatToolName[] {
  if (/^(?:请|帮我|请帮我)?(?:查|列出|搜索|筛选)/u.test(text.trim()) &&
      !/看板|dashboard|指标|统计|总数|数量|总收入|占比|趋势|多少|总计/iu.test(text)) {
    const company = /公司|企业/u.test(text);
    const user = /用户|账号/u.test(text);
    if (company && !user) return ['query_companies'];
    if (user && !company) return ['query_users'];
  }
  return chatToolNames;
}

export function toolDefinitions(names: readonly ChatToolName[]) {
  return names.map(name => ({ type: 'function', function: { name, description: schemas[name].description,
    parameters: { type: 'object', properties: schemas[name].properties, additionalProperties: false } } }));
}
