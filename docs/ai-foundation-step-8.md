# AI 基础能力第八步 · 统一 Redis 服务

`AiModule` 提供并导出单例 `AiCacheService`。AI 业务代码注入该服务，使用 `set`、`get` 和 `invalidate`。连接、Key 拼接、JSON 编解码和过期策略都在 `bknd/src/ai/cache/` 中管理。

## Key 与过期时间

| 类别 | Redis Key | 默认有效期 |
| --- | --- | --- |
| 会话 | `ai:session:<userId>:<sessionId>` | 7200 秒 |
| 聊天结果 | `ai:chat_cache:<userId>:<业务维度>:<问句与条件的摘要>:<维度版本>` | 默认 600 秒 |
| 模型调用 | `ai:llm_cache:` | 本周只预留前缀 |
| 任务临时状态 | `ai:task_state:<userId>:<taskId>` | 写入时由调用方传入 |

调用方使用认证上下文的用户 ID，并先按业务 Service 的规则确认资源归属。UUID 统一为小写，业务维度进行 URL 编码，聊天查询摘要包含原始问句与业务条件。同一用户在不同业务维度查询相同问句，会得到独立的 Key。

## 在 AI Service 中调用

下面是已注入 `AiCacheService` 的方法体示例，`userId` 和 `sessionId` 为已验证的 UUID。

```ts
const key = { kind: 'session', userId, sessionId } as const;
await this.cache.set(key, [{ user: '你好', assistant: '你好！' }]);
const context = await this.cache.get(key);
const removed = await this.cache.invalidate(key);
```

`set` 用一条 Redis `SET … EX` 同时写值和有效期。第三个参数可覆盖有效期，单位为正整数秒。`get` 返回 JSON 值，未命中、过期或 JSON 损坏时返回 `undefined`，缓存中的 JSON `null` 会原样返回。`invalidate` 只删除指定 Key，首次删除已有记录返回 `true`，再次删除返回 `false`。

最近十轮的选择和 PostgreSQL 回源见[第九步](ai-foundation-step-9.md)。聊天结果的业务条件、开关、有效期及失效入口见[第十步](ai-foundation-step-10.md)。

## 启动与验证

在项目根目录启动 Compose 的 Redis，再进入后端执行针对真实 Redis 的测试。

```bash
docker compose up -d --wait redis
docker compose exec redis redis-cli ping
cd bknd
npm run test:e2e -- test/ai-cache.e2e-spec.ts
```

Nest 启动时读取 `REDIS_URL`，默认值为 `redis://127.0.0.1:16379/0`。连接后发送 `PING`，启动检查最多等待 2 秒。Redis 暂时不可达时会记录告警并在后台重连，已有数据库接口可以继续启动。离线缓存操作会抛出 `ServiceUnavailableException`，调用方可据此选择回源。应用关闭时会释放连接。测试使用随机 UUID，并仅清理本次创建的 Key。
