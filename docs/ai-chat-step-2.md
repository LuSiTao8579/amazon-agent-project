# AI聊天第2步：会话与消息数据库

一个用户可以拥有多个会话；一个会话包含多条消息；一条消息可有关联附件元数据。
0003_ai_chat.sql 是新增迁移，不修改0001/0002。附件表仅保存元数据，本步不上传文件、不连接模型。

- ai_chat_sessions.user_id 外键关联 users.id，title为会话标题。
- ai_chat_messages.session_id 引用会话，role区分user/assistant，message_type标记消息类型，content以JSON对象保存。
- position是数据库生成的顺序号，按它读取消息，避免同一时刻产生的记录顺序混乱。
- ai_chat_attachments记录文件名、类型、大小和内部存储标识；并不代表文件已上传或模型能读取文件。
- 实体类用于描述pg返回的数据；当前项目没使用ORM，这些类不会自动创建表，建表依靠SQL迁移。
- ChatRepository 的读写都使用参数化SQL并按userId检查会话归属；后续API必须从JWT获取userId，不能相信前端传入的userId。
- 本步没有Controller、前端页面和上传接口。用户/会话/消息有依赖时删除会被数据库拒绝，后续删除功能需明确策略。
- listMessages对于空会话或无权限都返回空数组；后续服务应先使用getSession判断并返回一致的无权限/不存在结果。

运行：在项目根目录启动Docker Desktop后执行 docker compose up -d --wait；进入bknd执行 npm run db:migrate。
检验：npm run db:migrate -- --status；npm run test:e2e；npm run build；npm run lint。
迁移前需确认备份；不要执行docker compose down -v或删除旧数据。
