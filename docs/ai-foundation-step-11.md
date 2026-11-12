# AI 基础能力第十一步 · 任务临时状态

本周完成任务状态存储预留，尚未实现完整 LangGraph Checkpointer。后续执行器可注入 `AiModule` 导出的 `AiTaskStateStore`，保存一项任务的最新 JSON 快照。历史检查点和断点恢复属于后续适配工作。

## 在后端使用

传入认证上下文中的用户 ID 和已创建的 `ai_task_record` ID。读、写、清理都会通过 `AiTaskService.get` 在 PostgreSQL 核对任务归属。任务不存在或属于其他用户时，调用得到同样的 404。Redis 操作统一经过 `AiCacheService`，Key 为 `ai:task_state:<userId>:<taskId>`。

```ts
// taskStates 是注入的 AiTaskStateStore。这里记录任务下一次要处理的页码。
await taskStates.write(userId, taskId, { step: 'collect', nextPage: 3 }, 300);
const snapshot = await taskStates.read(userId, taskId);
const removed = await taskStates.clear(userId, taskId);
```

- `write` 用一条 Redis `SET … EX` 替换整个快照并设置有效期。同一任务同时写入时，以 Redis 最后执行的写入为准。
- `read` 返回保存的 JSON。合法任务尚未写入或快照已过期时返回 `undefined`，存入的 JSON `null` 会原样返回。读取不会续期。
- `clear` 仅清理指定任务的快照，删除已有 Key 返回 `true`，重复清理返回 `false`。快照过期和清理均保留 PostgreSQL 中的任务记录及其状态。

任务记录被删除后，通过该存储访问任务会得到 404。仍留在 Redis 的快照由 TTL 清理。

## 设置有效期

在 `bknd/.env` 添加下行并重启后端，即可将统一有效期设为 30 分钟。

```dotenv
AI_TASK_STATE_TTL_SECONDS=1800
```

配置后，调用 `write` 可省略第四个参数，也可以传入本次写入专用的秒数。未配置时，每次写入都要指定正整数秒。Redis 不可用时操作会抛出 `ServiceUnavailableException`，执行器可以据此区分存储故障与状态过期。

## 本地验证

启动项目 Redis 和 PostgreSQL，并将后端连接到已执行迁移的测试数据库。在 `bknd` 运行以下测试，覆盖真实过期、覆盖写入、清理和跨用户访问。

```bash
npm run test:e2e -- test/ai-cache.e2e-spec.ts test/ai-services.e2e-spec.ts
```
