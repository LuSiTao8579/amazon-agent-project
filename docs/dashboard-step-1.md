# Dashboard 第一步：统计口径

数据来自 PostgreSQL 的 companies 全表，不使用分页结果。所有已登录用户可读。

- 卡片：公司数、营收总和、去除首尾空白并忽略大小写后的唯一国家数、员工总数。
- 等级：每个 level 的数量及占全部公司的百分比，空数据时不除以零。
- 年份：按 founded_year 升序累计；空缺年份沿用上一年的累计值。CSV只有成立年份，不等于加入供应链日期。
- 页面打开或刷新时重新请求，数据变化不会自动实时推送；提供手动刷新。
- 营收缺少币种，显示原始数据单位；K/M/B 为千/百万/十亿。
- 空数据展示0和空状态；网络错误提供重试。

接口约定 GET /dashboard：summary（companyCount、totalRevenue、countryCount、employeeCount）、levelDistribution（level、count、percentage）、yearlyGrowth（year、newCompanies、cumulativeCompanies）。API以一次数据库查询获取一致快照，JWT守卫沿用已有认证。
