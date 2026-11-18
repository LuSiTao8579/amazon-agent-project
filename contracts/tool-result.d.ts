/** JSON 协议。message_type 使用 resultType，消息 content 保存完整 ToolResult。 */
type Page<Row> = { items: Row[]; total: number; page: number; pageSize: number };
export type UserRow = { name: string; email: string; role: string; status: 'active' | 'inactive' };
export type CompanyRow = {
  companyCode: string; companyName: string; level: number; country: string; revenuePerEmployee: number | null;
  city: string; foundedYear: number; annualRevenue: number; employees: number;
};
type Levels = { level: number; count: number; percentage: number }[];
type Years = { year: number; newCompanies: number; cumulativeCompanies: number }[];
export type Dashboard = {
  summary: { companyCount: number; totalRevenue: number; countryCount: number; employeeCount: number };
  levelDistribution: Levels;
  yearlyGrowth: Years;
};

export type DashboardReport = Pick<Dashboard, 'summary'> & Partial<Pick<Dashboard, 'levelDistribution' | 'yearlyGrowth'>>;

export type ToolOutput =
  | { resultType: 'text'; data: { text: string } }
  | { resultType: 'table'; data: ({ tableType: 'users' } & Page<UserRow>) | ({ tableType: 'companies' } & Page<CompanyRow>) }
  | { resultType: 'chart'; data: { chartType: 'levelDistribution'; rows: Levels } | { chartType: 'yearlyGrowth'; rows: Years } }
  | { resultType: 'report'; data: DashboardReport };

export type ToolErrorCode = 'INVALID_ARGUMENTS' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'TOOL_UNAVAILABLE' | 'EXECUTION_FAILED';
export type ToolFailure = { code: ToolErrorCode; data: null; message: string; resultType: 'text' };
export type ToolResult<T extends ToolOutput = ToolOutput> = ({ code: 'OK'; message: string } & T) | ToolFailure;
