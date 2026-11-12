# AI 基础能力第五步：DTO 和参数校验

本步骤在 `bknd/src/ai/dto/` 增加参数类和校验管道，没有新建 AI CRUD 路由或 Service，也没有改变数据库结构。对外请求的实际鉴权、用户隔离及数据库读写将在后续步骤接入和验证。

## 参数约定

| 用途 | DTO | 可接受字段 |
| --- | --- | --- |
| 创建会话 | `CreateAiSessionDto` | `title` 可选；属于现有聊天会话，去除首尾空白后 1–200 字符；扩展 ID 与归属由服务端处理 |
| 更新会话 | `UpdateAiSessionDto` | 必填 `status`，仅 `active` / `closed`；本 DTO 不修改已有聊天会话标题 |
| 查询会话 | `QueryAiSessionDto` | `page`、`pageSize`、可选 `status` |
| 创建 / 更新记忆 | `CreateAiMemoryDto` / `UpdateAiMemoryDto` | 必填 `content`，不能全为空白，最长 10000 字符；保留输入空格和换行 |
| 查询记忆 | `QueryAiMemoryDto` | `page`、`pageSize` |
| 创建任务 | `CreateAiTaskDto` | 必填 `name`，去除首尾空白后 1–200 字符；状态使用数据库默认 `pending` |
| 更新任务 | `UpdateAiTaskDto` | `name` / `status` 至少提供一项；状态为 `pending`、`running`、`completed`、`failed`、`cancelled` |
| 查询任务 | `QueryAiTaskDto` | `page`、`pageSize`、可选 `status` |
| 内部创建审计 | `CreateAiAuditDto` | `action`、`resourceType`、`result` 必填，`resourceId` 可省略、为 null 或 UUID；不接收 `userId` |
| 查询本人审计 | `QueryAiAuditDto` | 分页、可选 `result` 和时间范围 `from` / `to` |
| 管理员查询审计 | `AdminQueryAiAuditDto` | 在本人查询字段外允许可选 UUID `userId` 筛选 |
| 按 ID 查询 / 删除 | `AiIdParamsDto` | 必填 UUID `id`；仅校验格式 |

`action` 和 `resourceType` 去除首尾空白后均为 1–100 字符，`result` 为 `success` / `failure`。字符串参数不接受 PostgreSQL 不能保存的空字符；可选字段除 `resourceId` 外，传入 null 视为错误，不等同于省略。

分页默认 `page=1`、`pageSize=10`，范围分别为 1–1000000 和 1–100；查询字符串只接受十进制数字，不接受小数、科学计数法或重复参数。审计时间范围使用包含时区的完整 ISO 时间（`Z` 或 `±HH:MM`，秒的小数部分可为 1–3 位），`from` / `to` 都包含边界，`to` 不得早于 `from`。

## 如何接入下一步接口

- 在后续 Controller 中，对完整请求对象使用 `aiDtoPipe(DtoClass)`，例如 `@Body(aiDtoPipe(CreateAiMemoryDto))` 或 `@Query(aiDtoPipe(QueryAiTaskDto))`。按 ID 校验应使用 `@Param(aiDtoPipe(AiIdParamsDto))` 接收包含 `id` 的对象，而不是把对象管道直接用于 `@Param('id')` 字符串。
- 该管道沿用项目的转换、白名单、拒绝未知字段和安全错误配置，并额外拒绝数组、null 和标量。它仅做参数校验，不负责鉴权。
- 普通用户 DTO 不接受 `userId`：Service 必须从 JWT 验证后的上下文获取用户身份，并在所有查询与写操作中强制限制本人。`AdminQueryAiAuditDto` 只能在 JWT 和管理员守卫之后使用；无 `userId` 也必须由权限控制决定可见范围。
- `CreateAiAuditDto` 仅供可信服务端内部使用，审计操作者从可信上下文另行传入；不要开放任意客户端创建审计的接口。审计不提供更新或删除 DTO。
- 审计 `from` / `to` 及任务/会话状态只是参数约定，后续 Service 需要真正实现筛选。DTO 校验不能替代数据库约束、资源归属检查、任务状态流转规则或审计权限。

## 验证

`ai-dto.spec.ts` 使用实际 Nest 校验管道和仅在测试中存在的 HTTP Controller，覆盖合法输入、必填/空值、长度、枚举、分页、UUID、时间范围、未知字段与清晰的 400 响应。数据库集成测试同时验证 DTO 使用的状态和审计结果值能被迁移的 CHECK 约束接受。构建、lint、单元测试与隔离数据库中的完整 E2E 回归通过。
