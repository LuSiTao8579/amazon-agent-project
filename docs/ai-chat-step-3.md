# AI聊天第3步：NestJS会话接口

## 代码结构
- ai-agent.module.ts：组织控制器、服务、仓库和认证模块。
- ai-agent.controller.ts：定义HTTP路径；JWT守卫验证身份，userId从认证结果取得。
- ai-agent.dto.ts：校验标题、消息、分页输入，以及Swagger响应说明。
- ai-agent.service.ts：业务规则和权限检查；他人会话与不存在的会话统一返回404。
- chat.repository.ts：带用户归属条件的参数化数据库查询。

## 当前接口（使用 Bearer JWT）
- POST /ai-agent/sessions：body可为 {} 或 {"title":"供应链问题"}，返回201和新会话。
- GET /ai-agent/sessions?page=1&pageSize=20：仅列出当前用户的会话。
- POST /ai-agent/sessions/:id/messages：body为 {"text":"你好"}，返回201和已保存的用户消息。
- GET /ai-agent/sessions/:id/messages?page=1&pageSize=20：读取当前用户会话消息，按照位置升序。

列表返回 {items, page, pageSize, hasMore}；默认每页20条，最大100条。消息分页由旧到新；客户端要加载全部页才能恢复完整历史。
DTO拒绝额外字段：请求不能指定role或冒充assistant；text不改动首尾空格和换行。缺少登录返回401，UUID不合法返回400，未知或他人会话返回404。

## 重要边界
这一步仅保存用户文本。POST消息当前**不调用模型，也不生成AI回复**；后续步骤再接模型和失败处理。
测试中在服务端创建模拟assistant记录，用于验证历史读取，公共接口没有开放伪造AI回复。
附件上传、文件存储、会话删除、AI模型配置和聊天页面均不在此步实现。

## 自己使用Swagger测试
1. 打开Docker Desktop，在项目根目录执行 docker compose up -d --wait。
2. 在bknd执行 npm run db:migrate，然后 npm run start:dev。
3. 浏览器打开 http://127.0.0.1:3001/docs，在 /auth/login 使用自己已有的邮箱密码获取短期 accessToken。
4. 点击 Swagger 的 Authorize，填入 accessToken；不要把密码、Token或截图公开。
5. 找到 AI 会话，POST创建会话，复制响应中的id；再在POST消息中填id与text。
6. GET消息读取刚保存的内容。也可以创建第二个会话并从GET会话列表查看。

也可以导入 postman/ai-chat-step-3.postman_collection.json，选择已有 Amazon Agent — Local 环境，并在token变量中填入登录取得的accessToken。依次执行01至05，02自动把会话ID写入当前环境的aiChatSessionId，供后续请求使用。每次执行02会创建一条本地演示会话，当前步骤尚无删除接口。

## 自动验证
在bknd运行 npm run build、npm run lint、npm test、npm run test:e2e。
HTTP测试使用随机测试账号和模拟消息，验证登录、分页、参数检查、用户隔离和持久化；测试结束只清理本次数据。
