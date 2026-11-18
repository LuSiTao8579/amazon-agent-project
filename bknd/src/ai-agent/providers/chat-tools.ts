import { DASHBOARD_CHARTS, DASHBOARD_VIEWS } from '../../dashboard/dashboard.dto.js';
import { COMPANY_SORT_COLUMNS } from '../../companies/company.dto.js';
import { USER_ROLES, USER_SORT_COLUMNS, USER_STATUSES } from '../../users/user-management.dto.js';

const paging = {
  page: { type: 'integer', minimum: 1, maximum: 1000000 },
  pageSize: { type: 'integer', minimum: 1, maximum: 100 },
  sortOrder: { type: 'string', enum: ['asc', 'desc'] },
};
const levels = { type: 'array', items: { type: 'integer', minimum: 1, maximum: 100 } };
const year = { type: 'integer', minimum: 1, maximum: 9999 };
const schemas = {
  query_companies: {
    description: '查询公司列表。公司名称按关键词搜索，多个等级满足其一。国家和城市为完整名称，英国使用 UK。',
    properties: { ...paging, search: { type: 'string', description: '公司名称关键词' },
      sortBy: { type: 'string', enum: Object.keys(COMPANY_SORT_COLUMNS) },
      country: { type: 'string' }, city: { type: 'string' },
      levels },
  },
  query_users: {
    description: '查询用户列表，支持姓名关键词、多岗位和账号状态组合筛选、排序及分页。',
    properties: { ...paging, search: { type: 'string', description: '姓名关键词' },
      sortBy: { type: 'string', enum: Object.keys(USER_SORT_COLUMNS) },
      status: { type: 'string', enum: USER_STATUSES, description: '启用为 active，停用为 inactive' },
      roles: { type: 'array', items: { type: 'string', enum: USER_ROLES } } },
  },
  dashboard_metrics: {
    description: '按成立年份范围、国家及多个等级统计公司指标。收入是入选公司的年营收之和。经营期间收入无法按此筛选。',
    properties: {
      foundedYearFrom: { ...year, description: '成立年份下限，含当年' },
      foundedYearTo: { ...year, description: '成立年份上限，含当年。单一年份用相同上下限' },
      country: { type: 'string', description: '完整国家名称，英国使用 UK' }, levels,
      charts: { type: 'array', items: { type: 'string', enum: DASHBOARD_CHARTS }, uniqueItems: true,
        description: '仅用于 report。只要指标卡传 []；指标卡加指定图传该图名称；完整看板省略。' },
      view: { type: 'string', enum: DASHBOARD_VIEWS, description: '只看等级占比选 levelDistribution；只看成立年份累计趋势选 yearlyGrowth；综合指标或多图选 report（默认）' },
    },
  },
};
export type ChatToolName = keyof typeof schemas;
const chatToolNames = Object.keys(schemas) as ChatToolName[];
export const toolInstructions = '普通对话直接回答。用户请求业务数据时，按查询对象选择一个工具。缺少查询对象时先问要查公司、用户还是 Dashboard。没有合适的可用工具时说明无法查询。仅传用户指定的业务条件。若条件无法由工具表达，说明限制并请用户确认。前 N 家用 pageSize，按公司名称排序用 companyName。禁止编造查询结果或身份参数。';

// 对象明确的列表查询收窄模型可选工具；统计、解释和上下文追问由模型结合历史判断。
export function candidateTools(text: string): readonly ChatToolName[] {
  if (/^(?:请|帮我|请帮我)?(?:查|列出|搜索|筛选)/u.test(text.trim()) &&
      !/看板|dashboard|指标|统计|总数|数量|总收入|占比|等级分布|累计|折线图|饼图|环形图|覆盖国家数|总营收|趋势|多少|总计/iu.test(text)) {
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
