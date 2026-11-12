# AI 基础能力第九步 · 会话短期记忆

发送 `POST /ai-agent/sessions/:id/turns` 时，后端为模型准备最近的对话。每轮对应 PostgreSQL 中一条 `completed` 的 `ai_chat_turns` 记录，以及它关联的两条 `ai_chat_messages`。进行中、失败、单独保存的用户消息和附件都不计入轮数。

## Redis 中有什么

Key 为 `ai:session:<userId>:<sessionId>`，值为按用户提问顺序排列的 JSON 数组。下面是一轮的示例。

```json
[{"turnId":"7f79be8c-7bfa-449d-b2cd-aab182858e2b","user":"有几个订单？","assistant":"有三个。"}]
```

数组最多保留 10 轮。第 11 轮写入后保留第 2 至第 11 轮。每次写入或回填使用 `SET … EX` 同时更新有效期，默认 7200 秒，可在 `bknd/.env` 用 `AI_SESSION_CACHE_TTL_SECONDS` 设置正整数秒并重启后端。

## 一次发送如何执行

1. 用 JWT 用户 ID 和会话 ID 检查归属，取得该会话的 PostgreSQL 咨询锁，在锁内复查归属、会话状态及最近 10 个已完成回合的 ID。来自不同后端进程的请求也遵守同一把锁。
2. 活跃会话读取 Redis。只有数组格式、回合 ID 和顺序都匹配才复用缓存正文。遇到过期、缺失或过时的值，按用户、会话和回合 ID 从 PostgreSQL 读取提问与回复，按先后顺序回填。这样即使上次对话已提交、进程却在写缓存前退出，下一次发送也能补回该轮。
3. 把已完成轮次和本次问题组成模型输入，沿用单条 16000 字符、总计 32000 字符的预算。历史过长时从最近的完整回合开始取。模型成功且数据库提交后，追加本轮、保留最后 10 轮，再释放锁。相同请求编号重试返回原结果。同会话并发发送时后到的请求返回 409，可以在前一次完成后重试。不同会话可并行。
4. 通过 `PATCH /ai/sessions/:id` 把状态设为 `closed`，在会话锁内主动删除 Key。沿用旧聊天入口的行为，关闭期间仍能发送，历史从 PostgreSQL 读取，跳过 Redis。重新设为 `active` 后，下次发送重新建立缓存。软删除同样主动清理 Key。

Redis 不可用时，对话和关闭操作仍可在 PostgreSQL 完成。若关闭时 Redis 无法执行删除，关闭期间聊天入口会跳过残留 Key，其有效期届满后由 Redis 清理。

## 本地验证

启动项目的 Redis 和 PostgreSQL 并配置测试数据库后，在 `bknd` 运行以下命令。

```bash
npm run db:migrate
npm run test:e2e -- test/ai-chat-turn.e2e-spec.ts test/ai-cache.e2e-spec.ts
```

聊天测试走真实 HTTP、JWT、PostgreSQL 和 Redis，模型使用可控的测试回复。测试会等待 Redis 的 Key 真正过期，然后验证下一轮模型收到此前保存在 PostgreSQL 的对话。
