# AI Agent 第二周第五步 · 工具执行审计

每次调用注册中心的 `execute(name, context, args)`，装饰器先生成一份脱敏参数快照，再执行工具。拿到工具结果后，它等待 `AiAuditService` 写入一条记录，随后把原业务结果交给调用方。直接注入工具并调用其公开 `execute` 也经过同一入口。工具作者只需要实现 `run`。[执行装饰器](../bknd/src/ai/tools/audit-tool-execution.decorator.ts) · [注册中心](../bknd/src/ai/tools/tool-registry.service.ts)

## 读一条审计

以 `query_companies` 查询某公司、每页 10 条、命中 1 条为例。授权用户会收到公司的业务字段。使用 `GET /ai/audits` 查询当前用户的审计时，工具记录中可以看到以下字段（节选）。

```json
{
  "action": "companies.read",
  "resourceType": "tool",
  "toolName": "query_companies",
  "result": "success",
  "inputParams": { "search": "[REDACTED]", "pageSize": 10 },
  "resultSummary": { "code": "OK", "resultType": "table", "returnedCount": 1, "total": 1 }
}
```

记录还包含由认证上下文提供的 `userId`、`ip` 和数据库生成的 `createdAt`。表格摘要区分本页行数和匹配总数，图表摘要记录数据点数，文本和报表记录类型及结果码。查询原文、业务行和异常详情都不进入摘要。入参保留嵌套对象和数组的结构、有效分页值和已知枚举；联系方式、金额及自由文本用 `[REDACTED]` 表示。快照限制深度和大小。[脱敏与摘要实现](../bknd/src/ai/tools/tool-audit-data.ts)

| 执行情况 | result | resultSummary.code |
| --- | --- | --- |
| 查询成功（包含零匹配） | success | OK |
| 当前用户缺少业务权限 | failure | FORBIDDEN |
| 工具已禁用或不可用 | failure | TOOL_UNAVAILABLE |
| DTO 校验失败 | failure | INVALID_ARGUMENTS |
| 业务查询抛出未知异常 | failure | EXECUTION_FAILED |
| 注册中心收到缺失或伪造的身份 | failure | UNAUTHENTICATED |

未知工具使用固定名称 `[unknown]`。注册中心拿不到可信身份时，用户 ID 和 IP 均为空，此类记录仅管理员全量查询可见。数据库约束仅对未认证的工具失败允许空用户 ID。请求若在 HTTP 的 JWT 守卫处就被拒绝，调用尚未进入注册中心。审计写入失败时服务端记录固定错误，调用方收到 `EXECUTION_FAILED`；当前只读工具的查询可能已经完成。

## IP 与访问范围

聊天代理构造转发请求时设置服务端 JWT 和必要的内容头。JWT 守卫使用 `request.socket.remoteAddress` 签发工具上下文，调用方传入的 IP 和转发头不能覆盖它。经 Next.js 代理时，这个值代表后端实际连接到的代理地址；直连后端时代表直连对端。[聊天代理](../ftnd/src/app/api/ai-chat/%5B...path%5D/route.ts) · [JWT 守卫](../bknd/src/jwt-auth.guard.ts)

普通用户从 `GET /ai/audits` 或 `GET /ai/audits/:id` 查本人记录；管理员从 `GET /ai/admin/audits` 查询全量，可用 `userId`、`result` 和时间范围筛选。客户端上报继续使用 `client.` 前缀，新增工具审计字段由后端写入。

## 迁移与验证

在目标环境启动新后端前，从 `bknd/` 执行 `npm run db:migrate`。迁移 0008 给现有审计表增加四个可空字段，旧记录可原样读取，原有外键与只追加保护继续生效。在配置了 Docker 的测试环境可运行 `bash scripts/verify-ai-foundation.sh`，验证历史记录升级，以及真实 PostgreSQL、Redis 和 HTTP 审计路径。[迁移](../bknd/migrations/0008_ai_tool_audit.sql) · [端到端验收](../bknd/test/tool-registry.e2e-spec.ts)
