# 第三周联合交付 · 存储与审计核查记录

2026-11-28 在独立 PostgreSQL 和 Redis 上复跑。以下各行来自独立场景，四表样本中的两条审计和九个聊天请求各自对账。复跑命令见文末。

| 核查项 | 预期 | 本轮实测 |
|---|---|---|
| 业务 SQL 边界 | 三个只读工具和七个写工具的预校验均通过业务 Service 访问业务数据 | 按下文的方法核对 AI 运行时代码中的 SQL、连接池、Repository、QueryBuilder 和调用目标，未发现 AI 直接读写 users、companies、relationships。 |
| 升级与四表质量 | 已有会话可读，迁移可重跑，通过 HTTP 创建的记录归属正确 | 旧表定义与数据快照一致。回读到 1 个会话扩展、1 条记忆、1 个任务、2 条工具审计。四表所检查的异常行数均为 0。 |
| 工具调用与审计 | 每次新调度对应一条审计，请求重放和入口鉴权失败各新增 0 条 | 9 个聊天请求中，6 次进入注册中心。数据库、审计 API 各新增同样的 6 条记录，其中成功 2 条、失败 4 条。其余 3 个请求的审计增量均为 0。 |
| 敏感字段与可见范围 | 数据库与审计 API 均无合成敏感明文，普通账号只能读取本人记录 | 密码、令牌、嵌套参数、自由文本及结果行标记检出 0。创建用户的聊天拦截、合法预览、非法输入各有 1 条审计；预览和审计都省略密码。公司预览审计中的营收值已遮盖。跨账号详情返回 404，普通账号访问管理员查询返回 403。 |

每次调用的状态码、执行人、审计增量、摘要字段和双账号可见范围详见[逐次审计对账](ai-week3-audit-verification.md)。本轮样本覆盖合成数据和隔离库，生产历史数据质量需在对应环境核对。数据库对全空白文本的约束仍有边界，见“四表样本与约束证据”。

## 业务 SQL 在哪里执行

聊天入口为 `ChatTurnService.send → answer → ToolRegistryService.execute`。注册中心将可信身份传给工具。基类校验当前权限、开关和 DTO；缓存命中直接返回工具结果，未命中才进入下表的业务方法。教学工具 `ExampleCountUsersTool.run` 同样调用 `UserManagementService.list`。[聊天回合](../bknd/src/ai-agent/chat-turn.service.ts) · [注册中心](../bknd/src/ai/tools/tool-registry.service.ts) · [基类](../bknd/src/ai/tools/base-tool.ts) · [业务工具](../bknd/src/ai/tools/business-tools.ts) · [教学工具](../bknd/src/ai/tools/example-count-users.tool.ts)

| AI 调用点 | 持有业务 SQL 的方法 | 数据与职责 |
|---|---|---|
| `QueryUsersTool.load` | [UserManagementService.list](../bknd/src/users/user-management.service.ts) | 复核管理员权限，在 users 上完成筛选、排序、分页和计数。工具挑选聊天显示的四个字段。 |
| `QueryCompaniesTool.load` | [CompaniesService.list](../bknd/src/companies/companies.service.ts) | 在 companies 上查询列表和详情，计算人均年营收。 |
| `DashboardMetricsTool.load` | [DashboardService.getDashboard](../bknd/src/dashboard/dashboard.service.ts) | 从 companies 的同一筛选集计算指标、等级分布与累计曲线。 |
| `JwtAuthGuard.canActivate`、`ToolPolicyService.isCurrentAdmin`、`AiAuditService.requireAdmin` | [UsersService.findById](../bknd/src/users/users.service.ts) | 按登录上下文复核账号和管理员身份。关系查询、修改及删除不在三类工具的调用路径上。 |

写工具只把已校验的参数、目标传入原业务 Service。四个用户工具共用 `UserManagementService.validateCreate / validateUpdate / validateRemove`，三个公司工具共用 `CompaniesService.validateCreate / validateUpdate / validateRemove`。这些方法负责读取邮箱占用、公司编码、管理员保护和供应链关联等业务状态。预校验通过和失败时，对业务写方法的调用次数及三张业务表的字段快照均由联合回归检查。[用户工具](../bknd/src/ai/tools/write/user-write-tools.ts) · [公司工具](../bknd/src/ai/tools/write/company-write-tools.ts) · [写工具验收矩阵](ai-week3-write-tools.md)

## AI 自有数据如何访问

| 文件与方法 | 访问方式、目标表与归属检查 |
|---|---|
| [AiModule 与 AI_ENTITIES](../bknd/src/ai/ai.module.ts)、[AiAuditModule](../bknd/src/ai/ai-audit.module.ts) | 独立 TypeORM 数据源注册四个 AI Entity，关闭自动同步和自动运行迁移。审计模块注入同一数据源的审计 Repository。 |
| [AiSessionService.create / list / getFrom / update / remove](../bknd/src/ai/services/ai-session.service.ts) | EntityManager 原生 SQL 读写 ai_chat_sessions，Repository 在同一创建事务中插入 ai_chat_session。更新时用咨询锁、归属条件和 QueryBuilder 更新扩展状态。删除委托给聊天软删除。 |
| [AiMemoryService](../bknd/src/ai/services/ai-memory.service.ts)、[AiTaskService](../bknd/src/ai/services/ai-task.service.ts) 的 create / list / get / update / remove | 各自仅使用 ai_user_memory、ai_task_record 的 Repository。创建取认证账号，列表按 userId 过滤，单条读写同时限定 id 和 userId。 |
| [AiAuditService.create / recordToolExecution / listScoped / getMine / getAsAdmin](../bknd/src/ai/services/ai-audit.service.ts) | Repository 写 ai_operation_audit。工具装饰器自动记录调用结果，列表用 QueryBuilder 过滤账号、结果和时间；普通账号只读本人，跨账号管理员查询需复核权限。[审计装饰器](../bknd/src/ai/tools/audit-tool-execution.decorator.ts) |
| [ChatRepository.createSession / listSessions / getSession / softDelete / addMessage / listMessages](../bknd/src/ai-agent/chat.repository.ts) | pg 连接池或传入的事务连接读写 ai_chat_sessions、ai_chat_messages。读取历史时关联 ai_chat_turns、ai_chat_attachments，并校验会话归属及软删除状态。 |
| [ChatTurnRepository.withSessionLock / findTurn / beginTurn / completedTurns / complete / fail / message](../bknd/src/ai-agent/chat-turn.repository.ts) | 使用独立 CHAT_LOCK_POOL。先校验会话归属，再按会话加锁，读写会话、消息、回合及会话扩展状态；按 session_id 与 request_id 恢复原回合。 |
| [ChatAttachmentService.upload / download](../bknd/src/ai-agent/chat-attachment.service.ts) | 使用 PG_POOL。在事务中更新归属会话并写消息和附件；下载通过附件、消息、会话的关联验证归属。 |

连接池装配在 DatabaseModule。走查时同时查找了 SQL 语句、连接池注入、实体注册、事务、Repository 和 QueryBuilder，再核对实际表名和被调用方法。验收脚本中的跨表 SELECT 用于独立对账。[连接池定义](../bknd/src/database/database.module.ts) · [四表回读脚本](../bknd/scripts/verify-ai-storage.mjs)

## 四表样本与约束证据

脚本通过注册和登录接口取得普通用户身份。固定模型只提供工具名和参数；工具执行、拒绝、审计提交和 PostgreSQL 均走应用实际实现。HTTP 请求完成后，从数据库回读新账号的全部对应行，并用另一账号访问各资源详情。

| 表 | 真实触发方式 | 回读结果 |
|---|---|---|
| ai_chat_session | POST /ai/sessions 创建，聊天后 PATCH 为 closed | 与 ai_chat_sessions 以同一 UUID 关联，原会话 user_id 匹配登录账号，扩展行恰好 1 条。旧聊天入口允许延迟补建扩展行，读取时默认 active。 |
| ai_user_memory | POST /ai/memories 创建“按公司名称排序” | 本人 1 条，ID 和内容一致。另一账号请求该 ID 返回 404。 |
| ai_task_record | POST /ai/tasks 创建，PATCH 将 pending 更新到 running | 本人 1 条，名称和状态一致，数据库 updated_at 晚于 created_at。 |
| ai_operation_audit | 在同一会话发起公司查询、普通用户查询用户列表，各用原 requestId 重放一次 | 本人恰好 2 条工具审计，分别为 query_companies / companies.read / success / OK 和 query_users / users.read / failure / FORBIDDEN。重放返回原消息。另一账号读取这两条审计均为 404。 |

同一账号完成上述调用后，记忆和任务仍各 1 条。升级测试库的全表核查中，悬空关联、不合规的匿名执行人、非法状态或结果、必填文本仅含空白、任务更新时间早于创建时间等所检查的异常行数均为 0。历史审计允许缺少后来增加的工具字段；无执行人的审计仅在迁移规定的未认证失败条件下合法。resource_id 是可空的历史标识，未定义业务外键。[四表迁移](../bknd/migrations/0007_ai_foundation.sql) · [审计兼容迁移](../bknd/migrations/0008_ai_tool_audit.sql)

数据库负例在可回滚事务中执行，实际检查外键失败（23503）、重复主键（23505）、缺失必填字段（23502）及状态、结果、文本检查失败（23514）。审计 UPDATE、DELETE 和 TRUNCATE 受只追加触发器保护（55000）。重复主键按表核查，业务重复调用按回合重放核查。不同新回合查询相同参数可合法产生多条审计。[数据库约束用例](../bknd/test/ai-foundation-schema.e2e-spec.ts) · [HTTP 归属与输入校验](../bknd/test/ai-foundation-api.e2e-spec.ts)

文本检查有一处层次差异：HTTP DTO 会拒绝全空白字符串，现有数据库长度约束使用 btrim，默认只裁剪普通空格。直接 SQL 写入只含制表符的文本时，单靠该长度约束不能保证拒绝；本次测试库核查同时检查了空白字符。上述行数仅描述本次隔离测试库。

## 复跑

在仓库根目录定位 AI 运行时代码的数据库调用点，再逐个核对上表中的方法及其实际访问的表。本轮命令列出三个聊天数据访问文件与四个 AI Service 文件。

```sh
rg -l -g '!*.spec.ts' 'InjectRepository|createQueryBuilder|PG_POOL|CHAT_LOCK_POOL|DataSource|\.query\(' bknd/src/ai bknd/src/ai-agent
```

在仓库根目录运行以下命令。脚本会启动临时 PostgreSQL 和 Redis，分别验证历史升级库和全新迁移库，结束后清理容器。四表样本在升级库中写入，负例和全量 E2E 在新库中执行。

```sh
bash bknd/scripts/verify-ai-foundation.sh
```
