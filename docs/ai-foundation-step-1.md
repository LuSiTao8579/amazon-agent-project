# AI 基础能力第一步：项目现状与复用检查

状态：现状检查与后续设计输入；本步骤不创建数据表、接口或缓存。

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

- `docs/ai-chat-step-1.md` 是聊天交互和接口草案，明确说明功能和接口尚未实现；它不是数据库或聊天 Service。
- 检查到的前端源码没有聊天窗口、聊天 API 代理或消息持久化实现。`agent/src/agent/__init__.py` 只是一次模型调用示例，消息存在本次运行的状态中，没有 PostgreSQL 存储。
- 现有迁移只有 `users`、`companies`、`relationships` 等结构，没有聊天会话或消息表。后端源码中也没有聊天消息 Service 或按会话读取最近消息的查询。
- 因此，依据当前仓库，**没有可以复用的 PostgreSQL 聊天消息记录，无法验证按会话稳定排序，也无法实现 Redis 失效后从 PostgreSQL 恢复最近对话**。不能把接口草案或进程内消息当成已持久化数据。

## 四张表与用户的关联方向

现有 `users.id` 是 UUID 主键。建议后续四张 AI 表分别有 `user_id uuid`，外键引用 `users(id)`；用户身份从 JWT 守卫提供的当前用户中获取，不信任客户端指定的归属。普通用户的数据读写都限制为本人；管理员的全量访问范围仅用于审计查询。

这只是后续设计输入，不是已经落地的表结构。用户被删除时四张表如何处理，特别是审计记录是否必须保留，需要在表设计阶段明确；不可默认级联删除审计记录。审计记录禁止通过 API 修改和删除，数据库层保护程度也应在设计时明确。本周按 leader 确认的范围不建设租户模型。

## 消息存储缺口：需要确认

Leader 确认以四张 AI 表为准，可复用已有 chat message，但当前仓库没有可复用实现。要实现“Redis 失效后从 PostgreSQL 会话记录恢复”，最小候选方案是在 `ai_chat_session` 中保存有序消息数据（例如 JSONB），无需第五张表。这只是待确认方案，不是已确定的实现。

需要先明确消息是否只保存最近 10 轮还是保留完整历史，以及并发追加、消息大小、稳定顺序和会话删除时的处理。若保存完整历史，单行持续增长、并发写入和历史分页需要特别评估；若只保存最近 10 轮，则无法提供完整历史。确认后才能确定会话字段和缓存回源实现。其他不依赖消息存储的工作可继续。

## 本周边界

- 四张表：`ai_chat_session`、`ai_user_memory`、`ai_task_record`、`ai_operation_audit`。
- 审计记录禁改禁删；管理员可查看全部审计记录。
- 任务状态为后续 LangGraph 预留，不宣称已实现 Checkpointer；模型调用缓存只预留。
- 业务 API 读写属于后续任务；本周只完成相关基础配置。
