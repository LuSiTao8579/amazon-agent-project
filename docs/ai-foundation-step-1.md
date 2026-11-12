# AI 基础能力第一步：项目现状与复用检查

状态：现状检查与后续设计输入；本步骤不创建数据表、接口或缓存。合并远端聊天功能后已更新检查结论。

## 检查范围与结论

检查当前仓库中的 `bknd/src`、`bknd/migrations`、`ftnd/src`、`agent/src`、依赖和基础设施配置。以下是对仓库代码的检查结果，不代表已检查任何外部服务或现存数据库中的手工建表。

| 能力 | 当前情况 | 后续处理 |
| --- | --- | --- |
| JWT 与当前用户 | `bknd/src/jwt-auth.guard.ts` 验证 Bearer JWT，从 `users` 重新读取用户，要求账号为 active，并把公开用户放入 `request.user`。`auth.module.ts` 导出守卫 | AI 对外接口复用守卫，从认证上下文取得用户 ID |
| 管理员权限 | `bknd/src/admin.guard.ts` 检查当前用户的 `isAdmin`；它依赖 JWT 守卫先设置用户 | 管理员全量审计查询复用，并正确配置守卫顺序 |
| 数据库 | `database/database.module.ts` 使用 `pg.Pool` 和 `DATABASE_URL`，启动时检查连接 | 保留现有业务数据库访问方式；仅为 AI 模块接入 TypeORM Entity，不启用自动同步 |
| 数据库迁移 | `bknd/scripts/migrate.mjs` 按文件名顺序执行 SQL，记录 `schema_migrations`，每个迁移使用事务 | 沿用原机制新增迁移，不修改已执行迁移或原有业务表 |
| 校验与接口文档 | `setup-app.ts` 注册全局 `ValidationPipe`、白名单和 Swagger；依赖已有 `class-validator`、`class-transformer` | 复用现有配置，AI DTO 补充校验和 Swagger 描述 |
| 错误处理 | 现有代码使用 Nest HTTP 异常；`setup-app.ts` 未注册项目自定义全局异常过滤器 | 沿用现有异常和响应方式，不假设已有独立的 AI 错误规范 |
| Redis | `compose.yaml` 配置 Redis 7 和持久化数据卷；后端依赖及源码中未发现 Redis 客户端或缓存服务 | 后续新增 AI 统一缓存服务和连接配置 |
| TypeORM | 后端 `package.json` 中没有 TypeORM 或 Nest TypeORM 依赖 | 后续仅为 AI 模块接入；SQL 迁移仍使用原机制 |

## 聊天消息现状

- 远端现有聊天实现已合并：前端有聊天窗口和 API 代理；后端 `ai-agent` 模块提供会话、消息和对话轮次相关接口和服务。
- 迁移 `0003_ai_chat.sql` 建立 `ai_chat_sessions`、`ai_chat_messages` 和附件表；`0004_ai_chat_turns.sql` 建立对话轮次表。消息保存 `session_id`、角色、内容等；自增 `position` 提供稳定顺序。是否已应用迁移到实际数据库需另行检查。
- `ChatRepository.listMessages` 通过会话关联检查 `user_id` 与未软删除状态，按 `position` 正序分页；`AiAgentService.listMessages` 先检查会话归属。现有查询不是“最近 10 轮”查询，缓存回源仍需按轮次与消息状态设计并验证。
- 项目已有会话表 `ai_chat_sessions`（复数），与新任务所列 `ai_chat_session`（单数）不同。两者如何复用或衔接需要在表设计阶段明确，避免重复会话和破坏现有消息外键。
- 当前 `entities/` 下的聊天类是数据类型类，并非 TypeORM Entity；消息访问使用 `pg` 和 `ChatRepository`。

## 四张表与用户的关联方向

现有 `users.id` 是 UUID 主键。建议后续四张 AI 表分别有 `user_id uuid`，外键引用 `users(id)`；用户身份从 JWT 守卫提供的当前用户中获取，不信任客户端指定的归属。普通用户的数据读写都限制为本人；管理员的全量访问范围仅用于审计查询。

这只是后续设计输入，不是已经落地的表结构。用户被删除时四张表如何处理，特别是审计记录是否必须保留，需要在表设计阶段明确；不可默认级联删除审计记录。审计记录禁止通过 API 修改和删除，数据库层保护程度也应在设计时明确。本周按 leader 确认的范围不建设租户模型。

## 消息复用：后续设计需确认

Leader 允许复用已有 chat message。当前代码已有 PostgreSQL 消息、轮次存储，可作为缓存回源的基础，不应再假定需要将消息嵌入新会话记录。具体应如何关联新任务要求的 `ai_chat_session` 与现有 `ai_chat_sessions`，以及是否需要调整既有结构，须结合“四张表”和“不修改原有业务表”的要求确认后设计。

后续需定义最近 10 轮的查询、失败或进行中轮次的处理、顺序、权限和缓存并发更新，并用实际数据库验证。现有正序分页查询不能直接等同于已完成的最近 10 轮回源功能。

## 本周边界

- 四张表：`ai_chat_session`、`ai_user_memory`、`ai_task_record`、`ai_operation_audit`。
- 审计记录禁改禁删；管理员可查看全部审计记录。
- 任务状态为后续 LangGraph 预留，不宣称已实现 Checkpointer；模型调用缓存只预留。
- 业务 API 读写属于后续任务；本周只完成相关基础配置。
