import { Inject } from '@nestjs/common';
import type { ToolOutput } from '../../../../contracts/tool-result.js';
import { CompaniesService } from '../../companies/companies.service.js';
import { CompanyListDto } from '../../companies/company.dto.js';
import { listSort } from '../../common/list.dto.js';
import { DASHBOARD_CHARTS, DashboardToolDto } from '../../dashboard/dashboard.dto.js';
import { DashboardService } from '../../dashboard/dashboard.service.js';
import type { ToolContext } from '../../jwt-auth.guard.js';
import { UserListDto } from '../../users/user-management.dto.js';
import { UserManagementService } from '../../users/user-management.service.js';
import { BaseTool } from './base-tool.js';
import { AiCacheService } from '../cache/ai-cache.service.js';
import type { AiChatResultQuery } from '../cache/ai-cache-key.js';
import { Tool, validateToolMetadata } from './tool.decorator.js';

// BaseTool 只在身份、权限、开关与 DTO 全部通过后进入 run。
abstract class CachedReadTool<Args extends object, Result extends ToolOutput> extends BaseTool<Args, Result> {
  @Inject(AiCacheService) private readonly cache: AiCacheService;

  protected abstract cacheConditions(args: Args): AiChatResultQuery['conditions'];
  protected abstract load(context: ToolContext, args: Args): Promise<Result>;

  protected run(context: ToolContext, args: Args): Promise<Result> {
    return this.cache.getOrLoadChat({
      kind: 'chat', userId: context.userId, dimension: validateToolMetadata(this.constructor).name,
      question: 'tool-result:v1', conditions: this.cacheConditions(args),
    }, () => this.load(context, args));
  }
}

type Table = Extract<ToolOutput, { resultType: 'table' }>;
type DashboardOutput = Extract<ToolOutput, { resultType: 'report' | 'chart' }>;

@Tool({ name: 'query_users', description: '按姓名关键词、多个岗位和账号状态查询用户，支持排序与分页', intent: 'QUERY_DATA', permission: 'users.read' })
export class QueryUsersTool extends CachedReadTool<UserListDto, Table> {
  readonly inputDto = UserListDto;
  constructor(@Inject(UserManagementService) private readonly users: UserManagementService) { super(); }

  protected cacheConditions(args: UserListDto) {
    return { ...listSort(args, 'createdAt', 'desc'), page: args.page, pageSize: args.pageSize,
      search: args.search?.trim() ?? '', roles: args.roles ? [...new Set(args.roles)].sort() : null, status: args.status ?? null };
  }

  protected async load(context: ToolContext, args: UserListDto): Promise<Table> {
    const { items, total, page, pageSize } = await this.users.list(args, context);
    return { resultType: 'table', data: { tableType: 'users', total, page, pageSize,
      items: items.map(({ name, email, role, status }) => ({ name, email, role, status })) } };
  }
}

@Tool({ name: 'query_companies', description: '按公司名关键词、多个等级、国家和城市筛选，排序并分页返回公司及详情', intent: 'QUERY_DATA', permission: 'companies.read' })
export class QueryCompaniesTool extends CachedReadTool<CompanyListDto, Table> {
  readonly inputDto = CompanyListDto;
  constructor(@Inject(CompaniesService) private readonly companies: CompaniesService) { super(); }

  protected cacheConditions(args: CompanyListDto) {
    return { ...listSort(args, 'companyCode', 'asc'), page: args.page, pageSize: args.pageSize,
      search: args.search?.trim() ?? '', country: args.country ?? null, city: args.city ?? null,
      levels: args.levels ? [...new Set(args.levels)].sort((a, b) => a - b) : null };
  }

  protected async load(_context: ToolContext, args: CompanyListDto): Promise<Table> {
    const { items, total, page, pageSize } = await this.companies.list(args);
    return { resultType: 'table', data: { tableType: 'companies', total, page, pageSize,
      items: items.map(({ companyCode, companyName, level, country, revenuePerEmployee, city, foundedYear, annualRevenue, employees }) =>
        ({ companyCode, companyName, level, country, revenuePerEmployee, city, foundedYear, annualRevenue, employees })) } };
  }
}

@Tool({ name: 'dashboard_metrics', description: '按公司成立年份、国家和等级统计 Dashboard 指标、等级占比和累计趋势', intent: 'STATISTICS_ANALYSIS', permission: 'dashboard.read' })
export class DashboardMetricsTool extends CachedReadTool<DashboardToolDto, DashboardOutput> {
  readonly inputDto = DashboardToolDto;
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) { super(); }

  protected cacheConditions(args: DashboardToolDto) {
    return { view: args.view ?? 'report', charts: [...(args.charts ?? DASHBOARD_CHARTS)].sort(),
      country: args.country ?? null, levels: args.levels ? [...new Set(args.levels)].sort((a, b) => a - b) : null,
      foundedYearFrom: args.foundedYearFrom ?? null, foundedYearTo: args.foundedYearTo ?? null };
  }

  protected async load(_context: ToolContext, { view, charts, ...filters }: DashboardToolDto): Promise<DashboardOutput> {
    const data = await this.dashboard.getDashboard(filters);
    if (view === 'levelDistribution') return { resultType: 'chart', data: { chartType: view, rows: data.levelDistribution } };
    if (view === 'yearlyGrowth') return { resultType: 'chart', data: { chartType: view, rows: data.yearlyGrowth } };
    if (!charts) return { resultType: 'report', data };
    return { resultType: 'report', data: {
      summary: data.summary,
      ...(charts.includes('levelDistribution') && { levelDistribution: data.levelDistribution }),
      ...(charts.includes('yearlyGrowth') && { yearlyGrowth: data.yearlyGrowth }),
    } };
  }
}
