# AI 聊天第 8 步：消息输入与附件保存

## 使用方式

1. 启动 Docker Desktop，在项目根目录运行 `docker compose up -d --wait`。
2. 在 `bknd` 目录运行 `npm run db:migrate`，再运行 `npm run start:dev`。
3. 在另一个终端的 `ftnd` 目录运行 `npm run dev`，登录工作台并打开右下角 AI 助手。
4. 输入文字按 Enter 发送；Shift + Enter 换行。首次发送会自动创建会话。等待模型回复时暂时禁用输入与上传，避免重复提交。
5. 点击回形针选择文件。选择后立即单独上传，不需要再点发送；上传成功后会在会话中出现文件名和下载链接，刷新后仍可看到。附件保存在本地 PostgreSQL 中，并非保存在 Git 仓库里。

## 本步的边界

支持非空的 UTF-8 TXT、MD、CSV、TSV，以及 PDF、DOCX、XLSX；单个文件不超过 5 MiB。后端对 PDF 和 Office 文件只做基本文件头检查，并不代表已完整解析或验证文件。上传和模型对话是独立操作：**附件只保存和下载，目前不会被自动传给模型分析**。如果需要模型读文件，后续还要设计文件解析、内容大小限制、模型适配和测试。

文件格式与大小在前端 `ftnd/src/features/ai-chat/upload-policy.ts` 和后端 `bknd/src/ai-agent/chat-attachment.service.ts` 中分别规定。调整时要让两端一致；数据库迁移还约束了单文件最大 5 MiB，如需提高限制，应新增数据库迁移，不要修改已执行的 `0005` 文件。

## 代码怎么配合

- `components/chat-input.tsx`：管理多行输入、键盘事件、文件选择和按钮状态。中文输入法组合期间不会把确认键误当作发送。
- `components/chat-window.tsx`：读取最近会话；没有会话时创建会话；调用真实对话接口或上传接口，并在完成后重新加载历史。失败时保留草稿并显示提示。
- `src/app/api/ai-chat/[...path]/route.ts`：Next.js 服务端白名单代理，校验登录、请求来源和请求体大小，JWT 保留在服务端。
- `bknd/src/ai-agent/ai-agent.controller.ts` 与 `chat-attachment.service.ts`：通过 JWT 和会话归属验证，校验文件类型和大小，在一个数据库事务中保存消息、附件元数据与文件内容。下载也需要登录且只能读取自己会话中的附件。
- `bknd/migrations/0005_chat_attachment_data.sql`：为附件表新增文件数据列。`chat.repository.ts` 查询历史时返回附件的安全元数据，不返回存储键或文件本体。
- `normalize-message.ts`、`types.ts` 和 `message-list.tsx`：把附件元数据转换为前端类型，并显示下载链接。

发送请求有唯一编号。同一个页面内网络结果不确定时重试保留编号，由后端避免同一个编号重复生成；模型明确失败后可重新发送。刷新或关闭窗口后，未提交的输入草稿及请求编号不会保留。历史接口目前最多展示最近会话的前 1000 条消息，分页浏览和多会话管理尚待后续实现。

## 验证

- 后端：`npm run test:e2e -- test/ai-agent-api.e2e-spec.ts` 覆盖文件上传、下载、格式与大小拒绝、未登录与跨用户访问。
- 前端：`npm run test:integration` 使用临时用户覆盖代理上传、刷新历史、下载和请求来源校验。需要先启动数据库和前后端。
- 实际网页：用临时账号测试真实千问两轮对话、键盘换行/发送、CSV 上传，以及刷新后的消息和附件恢复。临时账号、消息和文件已清理；实际模型调用可能产生少量 API 用量。
