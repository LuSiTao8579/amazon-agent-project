# AI聊天第4步：模型统一适配器

调用链：ModelService → createChatModel → 具体厂商适配器 → 厂商聊天API。
providers/chat-model.types.ts 定义统一消息、回复和错误类型；model.factory.ts 根据服务端配置选厂商；openai-compatible.adapter.ts 实现四家的文本请求。
Qwen额外传enable_thinking=false，其他厂商不传。四家地址和模型因地区/账号不同应使用厂商实际配置，不自动猜测型号。

本机配置放在被Git忽略的 bknd/.env.ai；不要把密钥发给他人或提交到仓库。
AI_MODEL_PROVIDER 可选 qwen、deepseek、gpt、kimi；各厂商使用 AI_厂商_API_KEY、AI_厂商_BASE_URL、AI_厂商_MODEL。切换后重启后端。
本地已有千问配置复制自 agent/.env（使用独立文件，不修改原文件）。真实厂商密钥和可访问的模型需用户自行提供。
示例在bknd/.env.example；先确认地区、Base URL与密钥匹配。

## 测试
在bknd执行 npm test、npm run lint、npm run build；模型的mock测试验证四家参数、错误、密钥不出现在错误中。
先启动Docker数据库并运行 npm run build，再执行 node scripts/smoke-ai-model.mjs。脚本通过Nest加载模块，真实调用一次已配置模型，产生少量模型API用量；只发送合成短句，不发送业务数据，也不会打印Key和模型回复。
本地验证：Qwen真实请求收到非空回复；DeepSeek、GPT、Kimi只通过模拟响应测试，尚未使用真实Key测试。
程序不自动重试外部请求，避免隐式重复计费；上游调用错误不会把密钥或响应体返回。服务配置文件只允许可信管理员编辑。
返回的finishReason可供后续业务层识别输出截断等状态；本步骤只支持非流式文本，不处理附件。
本步只实现模型适配器并注册到Nest，尚未将现有会话消息接口连接到真实模型；多轮持久化、上传和前端聊天在后续步骤完成。
