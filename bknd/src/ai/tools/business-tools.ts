import { Inject } from '@nestjs/common';
import type { ToolOutput } from '../../../../contracts/tool-result.js';
import { CompaniesService } from '../../companies/companies.service.js';
import { CompanyListDto } from '../../companies/company.dto.js';
import { DashboardToolDto } from '../../dashboard/dashboard.dto.js';
import { DashboardService } from '../../dashboard/dashboard.service.js';
import type { ToolContext } from '../../jwt-auth.guard.js';
import { UserListDto } from '../../users/user-management.dto.js';
import { UserManagementService } from '../../users/user-management.service.js';
import { BaseTool } from './base-tool.js';
import { Tool } from './tool.decorator.js';

type Table = Extract<ToolOutput, { resultType: 'table' }>;
type DashboardOutput = Extract<ToolOutput, { resultType: 'report' | 'chart' }>;

@Tool({ name: 'query_users', description: '按姓名关键词、多个岗位和账号状态查询用户，支持排序与分页', intent: 'QUERY_DATA', permission: 'users.read' })
export class QueryUsersTool extends BaseTool<UserListDto, Table> {
  readonly inputDto = UserListDto;
  constructor(@Inject(UserManagementService) private readonly users: UserManagementService) { super(); }

  protected async run(context: ToolContext, args: UserListDto): Promise<Table> {
    const { items, total, page, pageSize } = await this.users.list(args, context);
    return { resultType: 'table', data: { tableType: 'users', total, page, pageSize,
      items: items.map(({ name, email, role, status }) => ({ name, email, role, status })) } };
  }
}

@Tool({ name: 'query_companies', description: '按公司名关键词、多个等级、国家和城市筛选，排序并分页返回公司及详情', intent: 'QUERY_DATA', permission: 'companies.read' })
export class QueryCompaniesTool extends BaseTool<CompanyListDto, Table> {
  readonly inputDto = CompanyListDto;
  constructor(@Inject(CompaniesService) private readonly companies: CompaniesService) { super(); }

  protected async run(_context: ToolContext, args: CompanyListDto): Promise<Table> {
    const { items, total, page, pageSize } = await this.companies.list(args);
    return { resultType: 'table', data: { tableType: 'companies', total, page, pageSize,
      items: items.map(({ companyCode, companyName, level, country, revenuePerEmployee, city, foundedYear, annualRevenue, employees }) =>
        ({ companyCode, companyName, level, country, revenuePerEmployee, city, foundedYear, annualRevenue, employees })) } };
  }
}

@Tool({ name: 'dashboard_metrics', description: '按公司成立年份、国家和等级统计 Dashboard 指标、等级占比和累计趋势', intent: 'STATISTICS_ANALYSIS', permission: 'dashboard.read' })
export class DashboardMetricsTool extends BaseTool<DashboardToolDto, DashboardOutput> {
  readonly inputDto = DashboardToolDto;
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) { super(); }

  protected async run(_context: ToolContext, { view, ...filters }: DashboardToolDto): Promise<DashboardOutput> {
    const data = await this.dashboard.getDashboard(filters);
    if (view === 'levelDistribution') return { resultType: 'chart', data: { chartType: view, rows: data.levelDistribution } };
    if (view === 'yearlyGrowth') return { resultType: 'chart', data: { chartType: view, rows: data.yearlyGrowth } };
    return { resultType: 'report', data };
  }
}
