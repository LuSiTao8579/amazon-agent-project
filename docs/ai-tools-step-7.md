# AI Agent 第二周第七步 · 在聊天中执行工具和恢复结果

## 用聊天框验收

在配置了模型、PostgreSQL 和 Redis 的工作台登录，打开 AI 助手。模型需支持兼容 Chat Completions 的函数调用。可以依次尝试下面三个问题。

| 输入 | 可观察的结果 |
| --- | --- |
| 查英国、等级 2 和 3 的公司，按公司名称排序，取前 10 家 | 使用 `query_companies`。传入英国对应的 `UK`、等级 `[2, 3]`、按 `companyName` 升序、每页 10 条。聊天显示匹配的公司，可以展开看城市等详情。数据库没有匹配行时显示空结果。 |
| 查一下数据 | 聊天询问需要公司、用户还是 Dashboard。这个澄清回合也会保存。 |
| 查用户 | 注册中心检查当前账号。管理员可以查看用户表，普通用户会看到工具返回的权限提示。 |

刷新页面，再打开同一会话，查看公司详情。页面展示这次查询保存的结果。聊天窗口先取最新 100 条消息，可以通过“加载更早的消息”按游标回看历史。原业务历史 API 默认仍按时间正序分页。

## 跟一轮请求

1. 前端向已有的 `POST /ai-agent/sessions/:id/turns` 发送 `{ requestId, text }`。后端检查会话归属、取得会话锁，再查该请求编号。已完成的回合直接返回原消息。相同编号改写问题、正在生成时并发提交、重发已失败回合均沿用原有冲突处理。
2. 对象明确的列表查询向模型提供对应工具的参数定义。开放式对话提供当前账号可发现的工具。模型可以回复文本或提出一个函数调用。适配器核对候选名称、调用数量和 JSON 参数格式，注册中心使用 JWT 守卫签发的上下文复核权限、开关和业务 DTO，记录工具审计。[回合服务](../bknd/src/ai-agent/chat-turn.service.ts) · [模型适配器](../bknd/src/ai-agent/providers/openai-compatible.adapter.ts)
3. 助手消息和回合完成状态在同一数据库事务内提交。工具回复的 `messageType` 取自 `resultType`，`content` 保存完整结果及服务端生成的 `contextSummary`。后续模型使用简短摘要，例如“公司查询共 12 条，第 1 页返回 10 条。”Redis 过期时从 PostgreSQL 恢复同一摘要。旧文本回合沿用原文。[持久化逻辑](../bknd/src/ai-agent/chat-turn.repository.ts)
4. 前端读取历史时校验结果结构，选取需要展示的字段。公司表可展开，用户表显示四列，单图和组合报表复用 Dashboard 图表和指标卡。[消息解析](../ftnd/src/features/ai-chat/normalize-message.ts) · [结果渲染](../ftnd/src/features/ai-chat/components/message-renderer.tsx)

## 复验一次重试

在同一会话用同一个 UUID 和完全相同的问题连续提交两次。两次响应的 `turnId` 和 `assistantMessage.id` 应一致。访问 `GET /ai-agent/sessions/:id/messages` 可以对照原始结构化内容，从 `GET /ai/audits` 可以核对这次查询的一条工具记录。

在 `bknd/` 运行 `bash scripts/verify-ai-foundation.sh`，在 `ftnd/` 运行 `npm test`。数据库端到端用例固定模型的 HTTP 提案，经过生产适配器、JWT、工具注册中心和真实业务查询，并验证修改源数据后重试仍返回原快照。测试使用临时数据，无需模型密钥。[聊天回合验收](../bknd/test/ai-chat-turn.e2e-spec.ts)
