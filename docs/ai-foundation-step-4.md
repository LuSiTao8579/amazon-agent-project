# AI 基础能力第四步：四张表的 SQL 迁移

新增 `bknd/migrations/0007_ai_foundation.sql`，沿用现有迁移工具和事务，不修改已执行的迁移文件、原有业务表的字段、索引或约束。该迁移不自动建立会话扩展记录，也不新增接口；现有聊天功能继续使用原有表。

## 结构和行为

- `ai_chat_session` 以已有 `ai_chat_sessions.id` 为主键和外键，保存 AI 会话状态；原有消息和轮次结构不变。新旧会话记录的事务创建及历史会话补建属于后续 Service 工作。
- `ai_user_memory`、`ai_task_record`、`ai_operation_audit` 均以 `user_id` 关联现有 `users.id`。会话归属通过已有会话关联用户；具体用户隔离仍须在后续接口和 Service 中落实，外键不能替代权限校验。
- 四表的字段、允许状态、长度约束、索引及删除策略按 `docs/ai-foundation-step-2.md` 实现。前三张表的 `updated_at` 更新由已有 `set_updated_at()` 触发器函数处理；审计记录只有创建时间。
- 新增的审计触发器拒绝 `UPDATE`、`DELETE` 和 `TRUNCATE`；这是防止普通 SQL 修改的保护，不等于数据库所有者或超级用户无法禁用保护。部署时仍应将迁移/表所有者与应用角色分离，并限制应用账号的 `UPDATE`、`DELETE`、`TRUNCATE` 权限，本次迁移不会自动创建角色或完成授权配置。
- 新表的外键使用 `ON DELETE RESTRICT`。用户或现有会话被引用时，数据库会阻止硬删除，避免静默删除数据和审计；现有用户管理接口尚未将这种外键错误转换为专门的业务提示，后续接口工作需处理。

## 如何执行

在配置好 `bknd/.env` 的目标环境中：

```bash
cd bknd
npm run db:migrate -- --status  # 先查看迁移状态
npm run db:migrate              # 执行待处理的迁移
npm run db:migrate -- --status  # 确认 0007 已执行
```

迁移执行器在事务中执行每个文件，并用 `schema_migrations` 记录文件名；重复运行会跳过已执行的文件。应用启动时仍不会自动执行迁移。执行新迁移会在目标数据库建表，应先确认连接的是预期环境。

## 验证

在独立临时 PostgreSQL 数据库中分别验证了空库完整迁移和旧库升级。旧库先运行 0001～0006 并写入历史用户、会话和消息；升级前后比较现有用户、公司、关系及聊天表的 schema，确认一致，历史消息仍存在。重复迁移跳过 0007，审计 TRUNCATE 被拒绝。临时数据库测试后删除，未使用真实用户数据。

`bknd/test/ai-foundation-schema.e2e-spec.ts` 在可回滚的事务里验证 Entity 列映射、TypeORM 写入、默认值、主外键、状态与长度限制、更新时间、审计防修改及索引；后端完整 E2E、单元测试、构建和 lint 均已验证。数据库角色权限隔离及用户删除时的友好提示尚待后续实现或部署配置。
