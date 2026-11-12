# AI 基础能力第七步：HTTP 接口与 JWT

本步骤为 AI 会话、记忆、任务及审计增加 Controller，复用现有 JWT 和管理员守卫，不新增数据库迁移。接口通过认证后的 `request.user.id` 确定用户，不能通过请求体或普通查询参数选择其他用户。旧 `/ai-agent/sessions` 聊天接口保持原路径。新接口目前由 Nest 后端提供，尚未新增前端代理或页面。

## 接口列表

| 资源 | 路径 | 方法 | 说明 |
| --- | --- | --- | --- |
| 会话 | `/ai/sessions` | POST、GET | 创建、分页查询本人会话，可按 `status` 筛选 |
| 会话 | `/ai/sessions/:id` | GET、PATCH、DELETE | 查询、更新 AI 状态、软删除本人会话 |
| 记忆 | `/ai/memories` | POST、GET | 创建、分页查询本人记忆 |
| 记忆 | `/ai/memories/:id` | GET、PATCH、DELETE | 查询、更新、删除本人记忆 |
| 任务 | `/ai/tasks` | POST、GET | 创建、分页查询本人任务，可按 `status` 筛选 |
| 任务 | `/ai/tasks/:id` | GET、PATCH、DELETE | 查询、更新、删除本人任务 |
| 审计 | `/ai/audits` | POST、GET | 上报本人审计、分页查询本人审计 |
| 审计 | `/ai/audits/:id` | GET | 按 ID 查询本人审计 |
| 管理员审计 | `/ai/admin/audits` | GET | 管理员分页查询全量审计，可按 `userId` 筛选 |
| 管理员审计 | `/ai/admin/audits/:id` | GET | 管理员按 ID 查询审计 |

所有这些接口都需要 `Authorization: Bearer <JWT>`；管理员路径同时使用管理员守卫，Service 也会重新检查账号当前状态和权限。普通用户查询他人 ID 返回 404；管理员也不能通过普通会话、记忆和任务接口查看其他用户的数据。响应成功时设置 `Cache-Control: no-store`。

## 参数和响应

- 分页查询支持 `page`（默认 1）和 `pageSize`（默认 10，最大 100），响应为 `{ "items": [...], "page": 1, "pageSize": 10, "hasMore": false }`。
- 创建返回 201 和新记录，查询/更新返回 200 和记录，删除返回 200 `{ "deleted": true }`。会话删除为软删除；记忆和任务删除其记录。
- JWT 缺失、无效、过期或用户停用返回 401；非管理员访问管理员路径返回 403；参数不合法返回 400；不存在或无权访问的资源返回 404；会话正被生成回复占用时状态更新/删除返回 409。错误沿用 Nest 项目现有格式 `{ "statusCode": 400, "message": [...], "error": "Bad Request" }`（`message` 也可能为字符串）。
- 审计列表支持 `result`、`from`、`to`；时间范围须带时区且包含边界。完整输入校验见 `ai-foundation-step-5.md` 和 Swagger。
- 启动后端后访问 `http://127.0.0.1:3001/docs`，通过 Swagger 的 Authorize 填入登录获得的 Bearer JWT；`/docs-json` 是 OpenAPI 数据。

例如，上报本人审计时请求体可以是：

```json
{ "action": "task.open", "resourceType": "task", "result": "success" }
```

服务端从 JWT 设置操作者，存储的 `action` 为 `client.task.open`。为适应数据库最多 100 个字符的限制，客户端提交的 `action` 最长 93 个字符。**客户端上报的动作和结果未经服务端核实**；`client.` 是预留的来源标记，不是独立的来源认证机制；不应把此类记录视为服务端已确认执行成功。不要在上报字段中填写密码、令牌或完整敏感对话，接口不自动识别或脱敏。可信服务端自动审计应保留 `client.` 前缀供上报使用。本步骤没有自动对全部业务操作写审计。审计不提供 HTTP 修改或删除接口，数据库也拒绝修改、删除和清空。

## 本步骤边界

`PATCH /ai/sessions/:id` 可以保存 `active` 或 `closed`，但旧聊天发送接口暂未按此状态阻止消息发送；Redis 及关闭时缓存清理尚未实现。创建任务记录不会触发任务执行。

## 验证

HTTP 集成测试使用真实 JWT、守卫和 PostgreSQL，覆盖所有接口未登录拦截、跨用户读取和写入、普通用户/管理员权限、撤权和账号停用、分页与筛选、参数错误、审计上报与禁改禁删以及 Swagger。审计测试记录写在测试专用事务中并回滚，不污染开发数据库；完整测试在隔离的临时库执行。
