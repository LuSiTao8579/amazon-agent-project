# AI Agent 第二周第十步 · 聊天消息分发和错误展示

## 一次发送如何显示

聊天窗口向 `POST /api/ai-chat/sessions/:id/turns` 发送问题。回合完成后，代理返回完成状态，窗口再请求 `GET /api/ai-chat/history?sessionId=…`。打开或刷新会话也读取这条历史接口。历史代理在服务端执行 `normalizeMessage`，核对消息类型、结果码和所需字段，将用于展示的数据交给 `MessageRenderer`。[聊天窗口](../ftnd/src/features/ai-chat/components/chat-window.tsx) · [历史解析](../ftnd/src/features/ai-chat/normalize-message.ts)

| 结果类型 | 页面展示 |
| --- | --- |
| `text` | 文本组件显示普通对话和工具文本，保留 Markdown 格式 |
| `table` | 用户表显示姓名、邮箱、岗位和状态，公司表按行展开详情。结果保留 `total`、`page`、`pageSize` 和当前页的行 |
| `chart` | 按图表类型显示等级占比或成立年份累计趋势 |
| `report` | 显示四项指标，以及该报表包含的图表 |

例如，“查看英国公司指标，只附成立年份趋势图”对应 `dashboard_metrics` 的 `{"country":"UK","view":"report","charts":["yearlyGrowth"]}`。传 `charts: []` 得到纯指标卡，省略 `charts` 沿用完整看板。已请求但数据为空的图会显示空状态。[渲染组件](../ftnd/src/features/ai-chat/components/message-renderer.tsx)

## 在页面上区分几种结果

- 查询命中 0 条时，表格消息显示“没有符合条件的记录”。当前页超过末页时，提示仍保留匹配总数和页码。
- 工具返回已知失败码时，页面用统一的错误提示显示后端的安全说明。例如无权限的账号查用户时会看到“你没有权限执行此查询。”
- 旧文本照常显示。旧版表格、图表或报表只有标题时，提示历史消息缺少展示数据。当前结果的类型或字段无效时，该条消息显示格式提示。
- 自行验收时，可以先发送“查看英国公司指标，只附成立年份趋势图”，再刷新并打开原会话。两次应能看到相同的卡片数值和同一张折线图。在浏览器网络面板中可以看到发送成功之后的历史请求。

前端在 `ftnd/` 运行 `npm test`，后端在 `bknd/` 运行 `bash scripts/verify-ai-foundation.sh`。相关测试覆盖分页映射、报表选图、旧消息、空结果、错误与损坏数据。[前端测试](../ftnd/tests/ai-chat.test.mjs) · [聊天回合测试](../bknd/test/ai-chat-turn.e2e-spec.ts)
