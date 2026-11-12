# AI 基础能力第十步 · 聊天结果缓存

业务查询可以调用 `AiCacheService.getOrLoadChat(query, load)` 复用已授权用户的结果。命中时直接返回 JSON，未命中时执行 `load` 并缓存成功结果。业务异常原样返回，Redis 离线时仍可执行查询。普通多轮聊天继续使用会话记忆，本步的调用入口供后续业务 API 使用。

## 定义一次可复用的查询

下面以“今天有多少订单”为例。`userId` 来自认证上下文，调用方先验证用户对仓库的访问权限，再传入已经解析好的日期和筛选条件。`loadCount` 代表未来业务 Service 提供的查询函数。

```ts
const query = {
  kind: 'chat' as const,
  userId,
  dimension: 'orders',
  question: '今天有多少订单？',
  conditions: { warehouseId, businessDate, timeZone },
};
const count = await this.cache.getOrLoadChat(query, loadCount);
```

Key 包含用户 ID、业务维度、问句和条件的 SHA-256 摘要，以及维度版本。相同对象的字段顺序不影响命中，数组顺序和 JSON 值类型参与比较。问句按原文匹配。相对日期需要传入实际业务日期；如果上一轮决定了“这个仓库”指什么，可传入已解析的仓库 ID。回复本身依赖聊天历史时，条件还需包含会话 ID 和有序回合 ID 等能标识实际输入的信息。只有确认结果与其他条件无关时才传 `conditions: {}`。依赖尚未确定的查询直接走业务逻辑。

## 按维度配置

在 `bknd/.env` 设置以下环境变量并重启后端。示例启用订单缓存 300 秒，关闭库存缓存。调用可复用查询入口时，未配置的维度默认启用 600 秒。关闭的维度每次执行查询，直接读取得到 `undefined`，写入会跳过 Redis。

```dotenv
AI_CHAT_CACHE_POLICIES='{"orders":{"enabled":true,"ttlSeconds":300},"inventory":{"enabled":false}}'
```

## 写入与失效

| 调用 | 适用场景 |
| --- | --- |
| `getOrLoadChat(query, load)` | 查询前捕获当前版本，执行回源并在仍有效时发布。推荐用于异步业务查询 |
| `get(query)` | 只读当前结果。缺失返回 `undefined`，已缓存的 JSON `null`、`false` 和 `0` 都能正常命中 |
| `set(query, value)` | 写入调用方已确定为最新的结果。默认使用维度 TTL，也可通过第三个参数显式指定秒数 |
| `invalidate(query)` | 精确删除这个用户、问句和条件的结果 |
| `invalidateChatDimension('orders')` | 订单数据提交后，令所有用户在订单维度下的问句和条件同时失效 |

业务维度由服务端选定。每个使用中的维度共享一个 Redis 版本 Key。维度失效时移除该版本，下一次访问建立新版本，旧结果按各自 TTL 自动清理。精确失效和维度失效都能防止更新前启动的慢查询把旧结果重新发布到当前缓存。并发未命中可能各自执行查询。失效调用遇到 Redis 故障会抛出异常，业务更新方可在提交后重试。

## 验证

启动项目 Redis 后，在 `bknd` 运行以下测试。测试使用独立用户和维度，会让一个查询停在回源过程中，再执行失效和新的查询，检查旧结果返回后缓存里仍是新值。

```bash
npm run test:e2e -- test/ai-chat-result-cache.e2e-spec.ts
```
