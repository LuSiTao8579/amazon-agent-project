import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../database/database.module.js';

type Summary = { companyCount: number; totalRevenue: number; countryCount: number; employeeCount: number };
type Group = { level: number; count: number };
type Year = { year: number; count: number };
type Snapshot = { summary: Summary; levels: Group[]; years: Year[] };

// 纯函数可单独测试：补齐缺失年份，避免没有新增公司的年份被误看成数据中断。
export function buildDashboard(snapshot: Snapshot) {
  const total = snapshot.summary.companyCount;
  const levelDistribution = snapshot.levels.map(({level,count}) => ({
    level, count, percentage: total ? count * 100 / total : 0,
  }));
  let cumulativeCompanies = 0;
  const counts = new Map(snapshot.years.map(({year,count}) => [year,count]));
  const yearlyGrowth: { year: number; newCompanies: number; cumulativeCompanies: number }[] = [];
  if (snapshot.years.length) {
    const years = snapshot.years.map(row => row.year);
    for (let year = Math.min(...years); year <= Math.max(...years); year++) {
      const newCompanies = counts.get(year) ?? 0;
      cumulativeCompanies += newCompanies;
      yearlyGrowth.push({year,newCompanies,cumulativeCompanies});
    }
  }
  return {summary: snapshot.summary,levelDistribution,yearlyGrowth};
}

@Injectable()
export class DashboardService {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}
  async getDashboard() {
    // 单条SQL中的子查询共享同一个数据库快照，避免并发修改导致卡片和图表不一致。
    const result = await this.pool.query<{ snapshot: Snapshot }>(`
      WITH source AS MATERIALIZED (SELECT level, country, founded_year, annual_revenue, employees FROM companies)
      SELECT json_build_object(
        'summary', (SELECT json_build_object('companyCount',count(*)::int,
          'totalRevenue',coalesce(sum(annual_revenue),0)::float8,
          'countryCount',count(DISTINCT lower(btrim(country)))::int,
          'employeeCount',coalesce(sum(employees),0)::float8) FROM source),
        'levels', (SELECT coalesce(json_agg(json_build_object('level',level,'count',n) ORDER BY level),'[]'::json)
          FROM (SELECT level,count(*)::int n FROM source GROUP BY level) grouped),
        'years', (SELECT coalesce(json_agg(json_build_object('year',founded_year,'count',n) ORDER BY founded_year),'[]'::json)
          FROM (SELECT founded_year,count(*)::int n FROM source GROUP BY founded_year) grouped)
      ) AS snapshot`);
    return buildDashboard(result.rows[0].snapshot);
  }
}
