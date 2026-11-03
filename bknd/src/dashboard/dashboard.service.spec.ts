import { describe, expect, it } from 'vitest';
import { buildDashboard } from './dashboard.service.js';

describe('Dashboard累计计算', () => {
  it('空数据不会除以零或产生年份', () => {
    expect(buildDashboard({summary:{companyCount:0,totalRevenue:0,countryCount:0,employeeCount:0},levels:[],years:[]}))
      .toEqual({summary:{companyCount:0,totalRevenue:0,countryCount:0,employeeCount:0},levelDistribution:[],yearlyGrowth:[]});
  });
  it('补齐空年份并逐年累计', () => {
    const result = buildDashboard({summary:{companyCount:4,totalRevenue:12,countryCount:1,employeeCount:8},
      levels:[{level:1,count:1},{level:2,count:3}],years:[{year:2000,count:1},{year:2002,count:3}]});
    expect(result.levelDistribution.map(x=>x.percentage)).toEqual([25,75]);
    expect(result.yearlyGrowth).toEqual([
      {year:2000,newCompanies:1,cumulativeCompanies:1},
      {year:2001,newCompanies:0,cumulativeCompanies:1},
      {year:2002,newCompanies:3,cumulativeCompanies:4},
    ]);
  });
});
