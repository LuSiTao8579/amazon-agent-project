# AI Agent 第二周第四步 · 工具注册与动态开关

在已通过 JWT 守卫的请求中，Agent 注入 `ToolRegistryService`。注册中心在 Nest 启动时发现工具 provider，使用时根据当前用户权限和 Redis 开关给出候选。返回的候选仅包含只读元数据。

| 名称 | 意图 | 读取权限 | 默认开关 |
| --- | --- | --- | --- |
| query_users | QUERY_DATA | 有效管理员 | 开 |
| query_companies | QUERY_DATA | 有效登录用户 | 开 |
| dashboard_metrics | STATISTICS_ANALYSIS | 有效登录用户 | 开 |
| example_count_users | QUERY_DATA | 有效管理员 | 关（教学示例） |

## 按名称与意图调用

```ts
const context = request.toolContext;
requireToolContext(context);
const candidates = await registry.listByIntent('QUERY_DATA', context);
const company = await registry.findByName('query_companies', context);
if (company) {
  const result = await registry.execute(company.name, context, { page: 1, pageSize: 10 });
  // result.code 为 OK 时，从 result.data 读取公司列表。
}
```

默认情况下，管理员的查询候选为用户和公司，普通用户的查询候选只有公司。按名称查找对未知、禁用和不可见工具均返回 `undefined`。发现操作遇到无效身份或依赖故障时会抛出异常，调用方应处理查询失败。执行始终沿用第三步的统一结果结构。每次执行都会查验当前账号状态和管理权限、重新读取开关、校验业务 DTO，随后才调用业务查询。已获准并开始的查询可以完成。

三个业务工具调用现有 Service：用户与公司列表可用已有筛选、分页和排序；看板支持空参数读取当前综合指标。更多业务筛选和自然语言选择工具在后续步骤接入。

## 动态切换

所有后端实例读取 `REDIS_URL` 指定数据库的同一个 Redis 哈希 `ai:tools:enabled`。字段名是工具名，值 `0` 关闭，`1` 开启，删除字段恢复工具声明的默认值。此配置无 TTL，服务端每次查询和执行都重新读取。字段值异常时该工具关闭；Redis 读取失败时执行返回 `TOOL_UNAVAILABLE`。

已启动项目 Compose 服务时，在仓库根目录执行以下命令（示例使用默认逻辑库 0；自定义库时给 redis-cli 增加相应的 -n 参数）。

```sh
docker compose exec -T redis redis-cli HSET ai:tools:enabled query_companies 0
docker compose exec -T redis redis-cli HGET ai:tools:enabled query_companies
docker compose exec -T redis redis-cli HSET ai:tools:enabled query_companies 1
docker compose exec -T redis redis-cli HDEL ai:tools:enabled query_companies
```

## 添加一个工具

1. 继承 `BaseTool`，用 `@Tool({ name, description, intent, permission })` 声明元数据，按需加 `defaultEnabled: false`。名称采用小写字母开头的小写字母、数字及下划线，最长 64 个字符。
2. 提供具体 `inputDto` 和 `run` 方法；只注入业务 Service。将类加入 Nest 模块的 `providers`。独立模块导入 `AiToolsModule` 和所用业务模块即可，注册中心会发现新工具。缺少装饰器、描述、意图、权限、DTO、存在重名或覆盖基类执行入口时，启动报错。
3. 使用 `findByName`、`listByIntent` 和 `execute` 验证可见性、权限和参数。测试在工具被发现后切换开关，断言禁用时业务查询调用次数为零，重新启用后有且只有一次调用。

[装饰器](../bknd/src/ai/tools/tool.decorator.ts) · [注册中心](../bknd/src/ai/tools/tool-registry.service.ts) · [权限策略](../bknd/src/ai/tools/tool-policy.service.ts) · [业务工具](../bknd/src/ai/tools/business-tools.ts) · [动态开关端到端测试](../bknd/test/tool-registry.e2e-spec.ts)
