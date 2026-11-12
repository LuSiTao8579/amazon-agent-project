# AI Agent 第一周交付与验收

本周交付会话、长期记忆、任务和审计四类数据接口，以及后端共用的 Redis 缓存服务。数据归属取自 JWT 中的用户身份。后端同事可以在 Swagger 调用接口，也可以在独立测试库里复现本次验收。

## 配置并启动开发环境

1. 准备 Node.js 24、npm 和运行中的 Docker。在仓库根目录首次执行 `cp -n .env.example .env` 和 `cp -n bknd/.env.example bknd/.env`，再填入自己的配置。
2. 在根目录执行 `docker compose up -d --wait`。项目默认将 PostgreSQL 17 映射到本机 15432 端口，将 Redis 7 映射到 16379 端口。
3. 在 `bknd/` 依次执行下列命令。已有数据库沿用同一套迁移工具，按文件名及 `schema_migrations` 记录跳过已执行项。

```bash
npm ci
npm run db:migrate -- --status
npm run db:migrate
npm run db:migrate -- --status
npm run start:dev
```

第二次查看状态时应看到 `0007_ai_foundation.sql（已执行）`。四个 Entity 由 AI 模块的独立 TypeORM 连接加载，建表由上述 SQL 迁移负责。

| 配置 | 填写方法 |
| --- | --- |
| 根目录 `POSTGRES_PASSWORD` | Compose 创建数据库时使用的密码。 |
| 后端 `DATABASE_URL` | 本地格式为 `postgres://app:<编码后的密码>@127.0.0.1:15432/agent_dev`，密码对应根目录配置，特殊字符要做 URL 编码。 |
| 后端 `JWT_SECRET`、`PORT` | JWT 密钥至少 32 个字符，后端端口默认 3001。 |
| 后端 `REDIS_URL` | 默认 `redis://127.0.0.1:16379/0`。 |
| 后端 `AI_SESSION_CACHE_TTL_SECONDS` | 会话记忆有效期，默认 7200 秒，写入或回填时续期。 |
| 后端 `AI_CHAT_CACHE_POLICIES` | 按业务维度配置 JSON，例如 `{"orders":{"enabled":true,"ttlSeconds":300},"inventory":{"enabled":false}}`。未配置的维度调用结果缓存时默认启用 600 秒。 |
| 后端 `AI_TASK_STATE_TTL_SECONDS` | 可选的任务快照有效期，例如 `1800` 秒。省略时每次写入需传正整数秒。 |

后端运行配置读取 `bknd/.env.ai` 和 `bknd/.env`，前者优先；SQL 迁移工具读取 `bknd/.env`。将数据库连接配置放在 `bknd/.env`，调整缓存配置后重启后端。

## 用两个账号验证接口

打开 [本机 Swagger](http://127.0.0.1:3001/docs)。接口定义也可通过 [OpenAPI JSON](http://127.0.0.1:3001/docs-json) 获取。

1. 用 `POST /auth/signup` 注册两个测试账号 A、B，分别传 `email` 和 15 至 128 个字符的 `password`。用 `POST /auth/login` 登录 A，把返回的 `accessToken` 填入 Swagger 的 **Authorize**。
2. A 调用 `POST /ai/memories`，请求体为 `{"content":"报表按北京时间展示"}`。预期收到 `201`。保存响应中的 `id`，用 `GET /ai/memories/{id}` 读回原文。用 `GET /ai/memories?page=1&pageSize=10` 可以看到这条记录。
3. 登录 B，在 **Authorize** 中换成 B 的令牌，读取同一个 ID，预期为 `404`。B 的列表里也不会出现 A 的记录。B 若为普通用户，访问 `GET /ai/admin/audits` 会收到 `403`。退出 Swagger 授权后访问 `GET /ai/memories` 会收到 `401`。

| 资源 | 集合路径和方法 | 同一路径加 `/{id}` | 范围与筛选 |
| --- | --- | --- | --- |
| 会话 | `/ai/sessions` · POST、GET | GET、PATCH、DELETE | 本人。可按 `status` 筛选；PATCH 传 `{"status":"closed"}` 关闭，DELETE 软删除。 |
| 记忆 | `/ai/memories` · POST、GET | GET、PATCH、DELETE | 本人。创建或更新传 `content`。 |
| 任务 | `/ai/tasks` · POST、GET | GET、PATCH、DELETE | 本人。创建传 `name`，列表可按 `status` 筛选。 |
| 审计 | `/ai/audits` · POST、GET | GET | 本人。可按 `result`、带时区的 `from` 和 `to` 筛选。上报的动作带 `client.` 前缀。 |
| 管理员审计 | `/ai/admin/audits` · GET | GET | 管理员可查全部审计，并按 `userId` 筛选。其余资源维持本人范围。 |

列表默认第 1 页、每页 10 条，最多 100 条；返回 `items`、`page`、`pageSize` 和 `hasMore`。非法字段、UUID 或分页参数返回 `400`。用户归属由服务端填写。审计只追加，数据库也拒绝更新、删除和清空。接口字段和各状态值见[接口说明](ai-foundation-step-7.md)及[表结构设计](ai-foundation-step-2.md)。

## Redis Key 与调用入口

| Key | 读写时机与失效方式 |
| --- | --- |
| `ai:session:<userId>:<sessionId>` | 保存最近 10 个已完成回合，每轮是一条用户消息和对应的助手回复。回合提交后追加，关闭或软删除时清理。缓存失效时从 PostgreSQL 的 `ai_chat_turns` 和 `ai_chat_messages` 回填；旧聊天入口在会话关闭期间从数据库读取。 |
| `ai:chat_cache:<userId>:<编码后的维度>:<摘要>:<版本>` | 通过 `AiCacheService.getOrLoadChat` 查询。摘要包含原问句和显式传入的业务条件，维度版本存于 `ai:chat_cache:version:<编码后的维度>`。业务数据提交后可调用 `invalidate(query)` 精确失效，或调用 `invalidateChatDimension(dimension)` 让该维度下的结果失效。 |
| `ai:task_state:<userId>:<taskId>` | `AiTaskStateStore.write/read/clear` 会核对 PostgreSQL 任务归属。写入最新 JSON 快照，按 TTL 自动清理；过期后仍可查询任务记录。 |
| `ai:llm_cache:` | 仅预留前缀。本周没有模型结果缓存读写入口。 |

依赖会话、日期、筛选条件等信息的业务查询，应把实际影响结果的值放入 `conditions`。调用示例见[会话记忆](ai-foundation-step-9.md)、[聊天结果缓存](ai-foundation-step-10.md)和[任务快照](ai-foundation-step-11.md)。

## 复现整套验收

在仓库根目录执行。脚本启动专用 PostgreSQL 和 Redis，使用随机本机端口和临时凭证，退出时清理这两个容器及其临时卷。只跑验收时可以跳过前面的开发环境配置。

```bash
npm --prefix bknd ci
bash bknd/scripts/verify-ai-foundation.sh
```

本次后端构建、lint 和 TypeScript 类型检查通过。4 个单元测试文件共 23 项通过，13 个端到端测试文件共 116 项通过。旧库升级和编译产物 HTTP 验证由脚本另外执行。

| 验收项 | 实测结果（2026-11-12） |
| --- | --- |
| 空库与升级 | 空库顺序执行 0001 至 0007。另一库在 0006 写入测试账号、会话和一轮消息，再升级 0007。升级前后原有业务表定义及数据导出一致，仅新增指定四表。再次迁移后版本和执行时间均一致。 |
| 表结构 | 四个 Entity 的列名、类型和可空性与 PostgreSQL 一致。测试覆盖主外键、状态、长度、默认值、更新时间及分页索引所属表、列顺序和升降序。审计表拒绝 UPDATE、DELETE、TRUNCATE。 |
| 接口与权限 | 编译后的后端可以登录旧账号、查询旧会话、按顺序读回旧消息、上报并按 ID 读回新审计。HTTP 测试覆盖未登录、越权读写、普通用户和管理员审计范围、撤权、校验、分页及 Swagger。 |
| 会话与结果缓存 | 真实 Redis 验证 10 轮上限、并发发送、过期后从 PostgreSQL 恢复、关闭清理，以及查询结果按用户、维度和条件隔离。验证维度开关、默认及自定义 TTL、精确与整维度失效。 |
| 任务与模型预留 | 任务快照可写、可读、可清理，实际等待到期后读取为空，其他用户无法读取。全套回归结束时模型缓存 Key 为 0。 |
| 现有业务 | 注册登录、当前用户、用户管理、公司和 Dashboard 接口通过回归。修复了删除仍有关联记录的用户时返回 500 的问题，现返回 409；同一批删除中的其他用户和关联数据都保留。 |

本周已验证现有 PostgreSQL 消息可以回源，消息存储方案无需另行确认。Agent 调用业务 API 读写、业务更新触发缓存失效，以及完整 LangGraph Checkpointer 的历史检查点和恢复功能留待后续任务。自动化中的模型回复由测试实现提供，验收无需模型密钥。
