# AI 基础能力第二步：四张表数据设计

状态：可用于后续迁移和 Entity 开发的设计方案；本步骤不建表、不修改代码或数据库。字段长度和任务状态是本周初始约定，后续业务有明确需求时通过新增迁移调整。

## 原则与现有聊天的衔接

- 四张新表严格命名为 `ai_chat_session`、`ai_user_memory`、`ai_task_record`、`ai_operation_audit`；不修改原有业务表或已执行迁移，不删除已有聊天表。继续使用 SQL 迁移，AI 模块的 TypeORM `synchronize` 必须关闭。
- 已有 `ai_chat_sessions`（复数）保存会话及 `user_id`，`ai_chat_messages` 保存消息，`ai_chat_turns` 保存轮次。新表 `ai_chat_session` 是**一对一扩展**：`id` 同时是主键和指向 `ai_chat_sessions.id` 的外键；所有权、标题、软删除标记和最近更新时间以已有会话为准，不复制这些字段，避免双份数据不一致。消息仍通过原会话 ID 关联。
- 创建新 AI 会话时，现有会话与扩展行在同一事务创建；已有会话由受控服务在访问时按需补建扩展行，使用唯一约束处理并发。扩展表没有行时，原聊天功能仍可正常运行；补建不得修改旧表结构。会话列表从已有会话表出发，避免遗漏未补建的历史会话。
- 会话的用户归属是 `ai_chat_session.id → ai_chat_sessions.id → users.id`，不再冗余 `user_id`。查询和写入均关联旧会话并限制 `user_id`、`deleted_at IS NULL`；用户不能通过请求体指定所有者。其他三表的 `user_id` 直接引用 `users.id`，取自已验证身份。
- JWT 用户只能读写本人会话、记忆、任务和上报/查询本人审计；管理员可以查询所有审计，不因此获得其他资源的全量访问。接口按 ID 查询、更新、删除也必须带用户条件。
- 所有时间为 PostgreSQL `timestamptz`，由服务端写入；UUID 使用 `gen_random_uuid()`，由数据库生成，扩展会话 ID 除外。列表排序使用时间降序和 ID 作为稳定次序。

## 1. `ai_chat_session`：现有会话的 AI 扩展

| 字段 | 类型 | 约束与含义 |
| --- | --- | --- |
| `id` | `uuid` | 主键；非空；外键引用 `ai_chat_sessions(id) ON DELETE RESTRICT`；不得另行生成 |
| `status` | `text` | 非空，默认 `active`；仅允许 `active`、`closed` |
| `created_at` | `timestamptz` | 非空，默认 `now()`；扩展记录创建时间 |
| `updated_at` | `timestamptz` | 非空，默认 `now()`；扩展记录更新时通过既有 `set_updated_at()` 触发器刷新 |

索引：主键索引用于一对一关联；用户会话列表复用已有 `ai_chat_sessions_active_user_idx`，不新增旧表索引。`status` 筛选先按实际查询验证后再考虑索引，避免无依据建索引。

操作与状态：允许创建、读取、更新状态；关闭会话设置 `closed` 并清理其 Redis 短期缓存。删除会话沿用旧会话的软删除方式，扩展行及消息保留，普通接口不再返回；关闭不等于删除，已关闭会话是否重新打开由后续 API 明确控制。删除动作需协调旧会话锁、事务和缓存失效，不直接硬删旧表。外键 RESTRICT 阻止直接删除仍被引用的旧会话；用户删除也受已有会话外键限制。

## 2. `ai_user_memory`：用户长期记忆

| 字段 | 类型 | 约束与含义 |
| --- | --- | --- |
| `id` | `uuid` | 主键，非空，默认 `gen_random_uuid()` |
| `user_id` | `uuid` | 非空，外键 `users(id) ON DELETE RESTRICT` |
| `content` | `text` | 非空，`char_length(btrim(content)) BETWEEN 1 AND 10000` |
| `created_at` | `timestamptz` | 非空，默认 `now()` |
| `updated_at` | `timestamptz` | 非空，默认 `now()`，更新触发器刷新 |

索引：`(user_id, updated_at DESC, id)` 支持本人分页。允许用户创建、查询、更新和硬删除自己的记忆；不预设记忆分类、自动提取或向量检索。用户有记忆时直接删除用户会被外键阻止，需先通过明确流程处理记忆。

## 3. `ai_task_record`：任务记录

| 字段 | 类型 | 约束与含义 |
| --- | --- | --- |
| `id` | `uuid` | 主键，非空，默认 `gen_random_uuid()` |
| `user_id` | `uuid` | 非空，外键 `users(id) ON DELETE RESTRICT` |
| `name` | `text` | 非空，`char_length(btrim(name)) BETWEEN 1 AND 200` |
| `status` | `text` | 非空，默认 `pending`；仅允许 `pending`、`running`、`completed`、`failed`、`cancelled` |
| `created_at` | `timestamptz` | 非空，默认 `now()` |
| `updated_at` | `timestamptz` | 非空，默认 `now()`，更新触发器刷新 |

索引：`(user_id, created_at DESC, id)` 用于本人分页；`(user_id, status, created_at DESC, id)` 用于按状态筛选。允许用户创建、查询、更新和硬删除自己的任务记录；任务执行、状态流转规则、输入输出和检查点留给后续明确需求，本周不因状态字段声称已实现执行器。用户有任务记录时删除用户受外键限制，需先明确处理记录。

## 4. `ai_operation_audit`：只追加的操作审计

| 字段 | 类型 | 约束与含义 |
| --- | --- | --- |
| `id` | `uuid` | 主键，非空，默认 `gen_random_uuid()` |
| `user_id` | `uuid` | 非空，外键 `users(id) ON DELETE RESTRICT`；操作主体 |
| `action` | `text` | 非空，`char_length(btrim(action)) BETWEEN 1 AND 100`；服务端定义的操作名称 |
| `resource_type` | `text` | 非空，`char_length(btrim(resource_type)) BETWEEN 1 AND 100` |
| `resource_id` | `uuid` | 可空；记录对象 ID，不设置资源外键，避免删除资源时破坏历史审计 |
| `result` | `text` | 非空，仅允许 `success`、`failure` |
| `created_at` | `timestamptz` | 非空，默认 `now()`；发生/记录时间采用服务端时间 |

索引：`(user_id, created_at DESC, id)` 支持本人查询；`(created_at DESC, id)` 支持管理员全量查询。审计表不设置 `updated_at`：记录创建后禁止更新和删除。

原设计建议只允许可信服务端写入。第七步按任务中“创建和查询”接口的要求，增加经过 JWT 鉴权的本人审计上报；用户身份由服务端确定，客户端填写的操作和结果未经核实，服务端统一为其 `action` 添加 `client.` 前缀。不要把这类上报当作服务端已验证的操作结果；服务端内部生成的审计应保留该前缀给客户端上报使用。审计不提供修改或删除接口。新增表时以数据库触发器拒绝 `UPDATE` 和 `DELETE`，并在部署中限制应用角色的 `UPDATE`、`DELETE`、`TRUNCATE` 权限；表所有者或超级用户仍有管理数据库的能力，不能把它表述为绝对防篡改。调用方不得把密码、令牌或完整敏感对话放入审计字段；接口不自动识别或脱敏此类内容。用户有审计时直接删除用户会被 RESTRICT 阻止；不通过级联或置空破坏审计归属。保留期及合法的例外处理需另行确定，本步骤不实现例外删除。

## 关联、删除与缓存边界

- 所有四表的可见性由服务端按当前用户约束；管理员全量审计要额外检查管理员权限。数据库外键不能替代接口的用户归属校验。
- 用户删除使用 RESTRICT 会影响现有用户管理的硬删除：已有 AI 数据时数据库会拒绝删除。后续实现须将外键冲突转换为清晰业务错误，并测试批量删除事务不会部分成功；此处不修改用户表结构。账号停用与删除是不同操作。
- 新表间不增加不必要的外键，避免任务和记忆的生命周期被会话删除绑定。数据库中的任务记录是持久数据；Redis `ai:task_state:` 仅是临时状态，二者不是同一份存储。
- Redis 会话回源复用已有消息和轮次。`ChatTurnRepository.context` 已按用户消息的 `position` 读取最近 10 个 `completed` 回合，再转为正序并施加字符限制；它依赖调用方先校验会话归属，且为模型请求附加本次输入。缓存回源应复用其筛选原则，但需单独定义缓存格式、字符限制和并发一致性，不能直接当作已实现的缓存。
- 文档中的索引、触发器与约束均待后续迁移实际创建和验证。本步骤没有运行迁移或声称现存数据库已包含这些新表。
