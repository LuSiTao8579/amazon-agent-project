# AI 聊天：多会话管理

## 如何使用

1. 登录后打开右下角 AI 助手，点击窗口顶部的 **会话**。
2. 选择已有会话即可切换；列表每页 20 条，更多会话通过“加载更多”查看。
3. 点击“新建会话”，可填写名称；留空使用“新会话”。创建成功后自动切换过去。
4. 点击列表行右侧的删除按钮，阅读确认提示后可取消或确认。
5. 当前浏览器标签页刷新后会恢复上次选择；无可用选择时打开最近会话。在聊天窗口保持打开期间，切换会话会分别保留未发送的草稿。刷新或关闭聊天窗口后草稿不保证保留。

## 删除规则

删除使用软删除：为会话设置 `deleted_at`，正常列表、历史、对话和附件接口都不再返回该会话。消息、附件和数据库中的文件内容暂时保留；目前没有用户界面恢复功能。删除正在生成回复的会话会返回冲突，请等待生成结束。即使知道 ID，也只能操作属于自己的会话。

软删除不等于物理销毁，数据保留时长、恢复和彻底删除流程应由后续产品需求确定。

## 阅读代码

- `bknd/migrations/0006_ai_chat_soft_delete.sql`：增加软删除标记与活动会话索引；不要修改已经执行的旧迁移。
- `bknd/src/ai-agent/ai-agent.controller.ts`、`ai-agent.service.ts`：提供当前用户的会话详情和删除接口。
- `bknd/src/ai-agent/chat.repository.ts`、`chat-turn.repository.ts`：查询时过滤删除标记；删除和模型生成使用同一个会话锁，防止并发冲突。
- `bknd/src/ai-agent/chat-attachment.service.ts`：删除后的会话不再允许上传或下载附件。
- `ftnd/src/app/api/ai-chat/history/route.ts`：按用户选择的会话读取历史；未选择时使用最近会话。
- `ftnd/src/app/api/ai-chat/[...path]/route.ts`：提供经过身份校验的会话列表和删除代理。
- `ftnd/src/features/ai-chat/components/session-manager.tsx`：分页列表、创建与删除确认。
- `ftnd/src/features/ai-chat/components/chat-window.tsx`：记住当前选择，切换消息和临时草稿。

## 验证

数据库需执行 `cd bknd && npm run db:migrate`。后端测试 `npm run test:e2e -- test/ai-agent-api.e2e-spec.ts test/ai-chat-turn.e2e-spec.ts` 覆盖用户隔离、软删除后不可访问、数据保留和会话锁；前端 `npm run test:integration` 覆盖列表分页、切换读取及请求来源校验。

本步不涉及自动读取公司数据或让模型分析附件。单个会话历史显示仍沿用最多前 1000 条的限制。
