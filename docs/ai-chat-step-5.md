# AI聊天第5步：真实多轮对话与持久化

## 请求如何走
前端发送 POST /ai-agent/sessions/:id/turns，body包含 {requestId, text}。
JWT守卫取得当前用户；ChatTurnService和ChatTurnRepository检查会话归属并使用数据库咨询锁。
同一会话正在生成时返回409，不同会话可以并行。开始一轮对话时，在事务中保存用户消息和pending状态。
读取最近10个已完成回合，加本次消息后调用ModelService；上下文最多32000个JavaScript字符串长度单位。
超过预算时优先保留最新的完整回合；失败回合不作为后续上下文。单条历史消息超过16000单位时，该回合及更早历史不传入模型。
模型成功后，同一事务保存AI消息并把回合标记completed；模型失败时保留用户消息并将回合标记failed。
不把厂商原始报错、密钥或对话内容写入错误响应。超时返回504，其他模型错误返回502。
GET /ai-agent/sessions/:id/messages返回的用户消息包含turnId、turnStatus、errorCode；旧消息和AI消息这些字段可能为null。

## 重复和失败
客户端为每次发送生成UUID作为requestId；同一个会话、同一个编号和相同文本重复提交，成功结果复用，不再次调用模型。
相同编号搭配不同内容返回409；生成中同会话并发请求返回409。失败后若用户明确重新发送，需生成新requestId。
不自动重试模型。网络超时可能发生在厂商已经处理请求之后，无法保证厂商侧绝对只计费一次。
如果后端进程异常退出，数据库会释放咨询锁；下一次访问该会话的对话接口时把遗留pending标记为interrupted。
连接数据库后执行npm run db:migrate；0004为新增迁移，不修改原有消息表。

## 具体接口和响应
POST /ai-agent/sessions/:id/turns，Authorization为登录得到的Bearer Token，body例子：
```json
{"requestId":"a34c4b65-93ef-46f9-9682-f4041b4e9625","text":"你好"}
```
成功201返回 {turnId, status:"completed", userMessage, assistantMessage}。
模型失败返回 {status:"failed",turnId,userMessageId,errorCode,message}。
GET /ai-agent/sessions/:id/messages读取持久化历史。
原 POST /ai-agent/sessions/:id/messages仍只保存用户文本，不调用模型，以保持第3步接口兼容；用turns接口才能真实对话。

## 测试与演示
启动Docker并执行 npm run db:migrate；在bknd运行 npm run test:e2e、npm test、npm run lint、npm run build。
node scripts/smoke-ai-turns.mjs 会真实调用两次配置的模型，使用独立临时账号和合成测试文字，结束清理测试数据；可能产生少量API用量。
目前还没有前端聊天窗口，用户端刷新恢复需后续接入；本步通过HTTP和数据库验证历史以及后端重启后读取。
附件上传、意图识别、任务编排和其他厂商真实模型验证不属于本步。
