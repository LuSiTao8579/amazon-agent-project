# AI 基础能力第三步：独立 TypeORM 模块

本步骤新增 `bknd/src/ai/`，仅完成 TypeORM 接入和四个 Entity 的字段映射；数据库迁移、外键、索引、约束、审计防改和 CRUD 将在后续步骤实现。

- `AiModule` 使用名为 `ai` 的 PostgreSQL 数据源，读取现有 `DATABASE_URL`；只注册四个 AI Entity。`synchronize` 和 `migrationsRun` 均为 `false`，表结构仍由项目 SQL 迁移管理。
- 现有 `DatabaseModule`、业务 Service 和聊天功能继续使用原来的 `pg` 池；TypeORM 新建独立连接池，最多 5 个连接。现有 `pg` 池上限 10 个，两者最多合计 15 个连接，部署时需计入其他进程的连接预算。应用关闭时 Nest TypeORM 和现有数据库生命周期分别释放连接。
- `ai_chat_session.id` 使用现有聊天会话 ID，不自动生成；其他三个 Entity 的 ID 由数据库生成。数据库外键、状态检查、索引与触发器按第二步设计在后续 SQL 迁移中实现，Entity 中的类型或注释不能代替这些数据库保护。
- 现阶段四张新表尚未创建。应用能连接数据库并加载 Entity 元数据，但在新增迁移之前不能对这些表执行 CRUD；旧表的访问方式不变。

验证：后端构建、lint、单元测试；在隔离的临时 PostgreSQL 数据库执行已有迁移和全部后端 E2E，验证 AI 数据源可查询、仅加载四个 Entity、应用关闭时释放连接，启动未自动创建四张新表。测试数据库在结束后删除。
