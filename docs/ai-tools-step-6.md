# AI Agent 第二周第六步 · 公司基础查询

## 调用工具

已登录用户可以通过注册中心执行 `query_companies`。例如，在后端已通过 JWT 守卫的请求中，查询英国伦敦、名称含 Supply、等级为 2 或 3 的公司。

```ts
const result = await registry.execute('query_companies', req.toolContext, {
  search: 'Supply',
  levels: [2, 3],
  country: 'UK',
  city: 'London',
  sortBy: 'companyName',
  sortOrder: 'asc',
  page: 1,
  pageSize: 10,
});
```

可以用同一登录身份调用 `GET /companies?search=Supply&levels=2,3&country=UK&city=London&sortBy=companyName&sortOrder=asc&page=1&pageSize=10`，对照工具的 `result.data` 和业务 API 返回的分页对象。两者共用 `CompanyListDto` 和 `CompaniesService.list()`。注册中心沿用 `QUERY_DATA` 意图、`companies.read` 权限、运行时开关和审计。[工具实现](../bknd/src/ai/tools/business-tools.ts) · [公司查询](../bknd/src/companies/companies.service.ts)

## 读懂结果

- 公司名按关键词做字面包含匹配。等级之间满足一个即可，公司名、等级、国家、城市之间要同时满足。国家和城市可单独省略，传值时去除首尾空格，按完整名称匹配，忽略大小写。
- 默认按公司编码升序，每页 10 条，最多 100 条。指定其他白名单字段排序时，同值按公司编码升序。数据库在同一条语句内对筛选后的集合统计和分页。`total` 表示所有匹配公司数，`items.length` 表示当前页行数。例如共有 4 条、每页 2 条，第 3 页仍然成功，返回 `total: 4` 和 `items: []`。零匹配则返回 `total: 0`。
- 成功响应的 `resultType` 为 `table`，`data.tableType` 为 `companies`。聊天组件用 `companyCode` 标识行，默认显示名称、等级、国家和人均年营收。展开一行可见城市、成立年份、年营收和员工数量。
- 人均年营收由业务层计算，单位沿用公司数据源。员工数为零时返回 `null`，显示灰色“不可计算”。两个页面都按原始数值着色，小于 100 为橙色，100 至小于 500 为蓝色，500 及以上为绿色。显示时最多保留两位小数。[聊天公司表](../ftnd/src/features/ai-chat/components/company-table-message.tsx) · [色阶规则](../ftnd/src/components/revenue-per-employee.ts)

## 复验

在 `bknd/` 执行 `bash scripts/verify-ai-foundation.sh`（需要 Docker），其中的公司工具测试会创建隔离样本，对同一身份下的业务 HTTP 接口和注册中心调用逐页比较，覆盖多等级、地点交集、无结果、超出末页和零员工。在 `ftnd/` 执行 `npm test` 验证消息字段和颜色边界。自然语言选取工具、执行并保存新聊天回复属于后续聊天接入步骤。[后端对照测试](../bknd/test/company-tool.e2e-spec.ts) · [前端用例](../ftnd/tests/ai-chat.test.mjs)
