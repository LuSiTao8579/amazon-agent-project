import type { ToolResult } from './tool-result.d.ts';

const summary = { companyCount: 1, totalRevenue: 1200, countryCount: 1, employeeCount: 4 };
const yearlyGrowth = [{ year: 2020, newCompanies: 1, cumulativeCompanies: 1 }];
const levelDistribution = [{ level: 2, count: 1, percentage: 100 }];

// 合成数据。每个值均可直接 JSON 序列化为消息 content。
export const examples = {
  text: { code: 'OK', message: '查询成功。', resultType: 'text', data: { text: '匹配用户数为 1。' } },
  users: { code: 'OK', message: '查询成功。', resultType: 'table', data: {
    tableType: 'users', page: 1, pageSize: 10, total: 1,
    items: [{ name: '示例用户', email: 'analyst@example.test', role: 'Analyst', status: 'active' }],
  } },
  companies: { code: 'OK', message: '查询成功。', resultType: 'table', data: {
    tableType: 'companies', page: 1, pageSize: 10, total: 1,
    items: [{ companyCode: 'DEMO', companyName: '示例公司', level: 2, country: 'UK', revenuePerEmployee: 300,
      city: 'London', foundedYear: 2020, annualRevenue: 1200, employees: 4 }],
  } },
  empty: { code: 'OK', message: '查询成功。', resultType: 'table', data: {
    tableType: 'companies', items: [], total: 0, page: 1, pageSize: 10,
  } },
  chart: { code: 'OK', message: '查询成功。', resultType: 'chart', data: { chartType: 'yearlyGrowth', rows: yearlyGrowth } },
  report: { code: 'OK', message: '查询成功。', resultType: 'report', data: { summary, yearlyGrowth, levelDistribution } },
  forbidden: { code: 'FORBIDDEN', message: '你没有权限执行此查询。', resultType: 'text', data: null },
  disabled: { code: 'TOOL_UNAVAILABLE', message: '该工具暂不可用，请稍后再试。', resultType: 'text', data: null },
} satisfies Record<string, ToolResult>;
