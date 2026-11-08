# AI 聊天第 7 步：消息类型与 Markdown 展示

## 本步目标

从最近会话加载真实历史，按消息类型选择展示方式。文本消息支持 Markdown；表格、图表、报表和人工确认仅保留占位提示，业务展示和交互仍待实现。

## 阅读顺序

1. `ftnd/src/features/ai-chat/types.ts`：`ChatMessage` 是可辨识联合类型，每个分支用 `type` 区分；只有文本分支有 `content.text`。
2. `ftnd/src/features/ai-chat/normalize-message.ts`：把后端的 `messageType` 和 `content` 转换成前端类型，只传需要的字段。未知类型或无效的文本内容显示降级提示。
3. `ftnd/src/app/api/ai-chat/history/route.ts`：服务端按用户权限获取最近会话，并对每条消息进行转换。Cookie 和后端凭证不会作为消息内容返回。
4. `ftnd/src/features/ai-chat/components/message-list.tsx`：根据发送角色决定左右位置，并显示处理中/失败状态。
5. `ftnd/src/features/ai-chat/components/message-renderer.tsx`：根据 `type` 选择文本组件或尚未实现的类型提示。
6. `ftnd/src/features/ai-chat/components/text-message.tsx`：使用 `react-markdown` 展示标题、列表、加粗和代码块；不执行原始 HTML，不自动加载图片，并阻止不安全链接。
7. `ftnd/src/features/ai-chat/components/chat-window.tsx`：聊天窗口复用消息列表。

## 测试和体验

启动 Docker Desktop、数据库、Nest 后端和 Next 前端。登录后打开右下角 AI 助手，已有最近会话会被读取；要看到 Markdown，可以通过 Swagger 在自己的会话保存一条包含以下内容的文本，再重新打开窗口：

````text
# 测试标题
**重点**
- 第一项
- 第二项

```python
print("hello")
```
````

执行 `cd ftnd && npm test` 可测试消息归一化等逻辑；`npm run test:integration` 还需要本地数据库和前后端服务运行，会创建并清理测试数据。

本步尚未实现聊天输入、发送、上传文件，也没有实现其他四种消息的实际业务组件。下一步需要将输入框接入第 5 步的真实对话接口。
