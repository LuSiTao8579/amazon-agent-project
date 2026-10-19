# 第三步：注册、登录和真实用户认证

## 已完成的接口

继续使用第二步的 users 表、UsersService、pg 连接池和 Argon2id；没有新增迁移。
第三步交付时前端仍为原型；目前第四步已接入这些 API，见 [第四步说明](auth-step-4.md)。

| 接口 | 成功 | 失败 |
| --- | --- | --- |
| POST /auth/signup | 201，message 和 user；不自动登录、不返回 Token | 400 输入错误；409 邮箱已注册 |
| POST /auth/login | 200，accessToken、tokenType、expiresIn 和 user | 400 输入错误；401 邮箱或密码错误 |
| GET /auth/me | 200，数据库中的当前用户 | 401 凭证缺失、无效、过期，或用户不存在 |

### 请求规则

注册和登录都接收 JSON 的 email、password 两个字段；多余字段（例如 role）会被拒绝。
邮箱先去首尾空白并转小写，再检查格式和 254 字符上限，与第二步数据库约束保持一致。

注册密码采用本次实现选择的 15–128 字符规则；允许 Unicode、符号及空格，但不能全为空白。
这是当前开发约定，可根据 Leader 的要求统一调整。密码不 trim、不截断。
登录密码只要求非空且最多 128 字符，以便校验第二步已有的较短密码。

邮箱不存在和密码不匹配统一返回：
```json
{ "message": "邮箱或密码错误", "error": "Unauthorized", "statusCode": 401 }
```
不存在的邮箱也执行一次密码哈希校验，以减少明显的耗时差异。
输入错误的 message 是消息数组；例如密码太短。重复邮箱返回 409、message 为“该邮箱已注册”。

### 响应约定

注册成功：
```json
{
  "message": "注册成功，请登录",
  "user": {
    "id": "数据库生成的 UUID",
    "email": "learner@example.test",
    "createdAt": "ISO 时间",
    "updatedAt": "ISO 时间"
  }
}
```

登录成功返回：
```json
{
  "accessToken": "短期 JWT",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "user": {
    "id": "数据库用户 UUID",
    "email": "learner@example.test",
    "createdAt": "ISO 时间",
    "updatedAt": "ISO 时间"
  }
}
```

/auth/me 直接返回上述 user 对象。所有对外用户信息都不包含密码或哈希。
JWT 的 sub 为真实用户 UUID；签名算法 HS256，有效期 900 秒。
验证签名、有效期、issuer、audience 后再查询数据库；被删除的用户不能继续访问。
认证成功响应使用 Cache-Control: no-store。

## 启动与手动验收

在项目根目录：
```bash
docker compose up -d --wait
cd bknd
npm run db:migrate -- --status
npm run start:dev
```
第二步已经执行迁移；如果换了新数据库，先运行 npm run db:migrate。

打开 http://127.0.0.1:3001/docs：
1. POST /auth/signup → Try it out，输入测试邮箱和 15–128 字符密码，执行后得到 201。
2. 重复发送同一邮箱应得到 409；输入空值/错误格式应得到 400。
3. POST /auth/login 使用相同邮箱密码，得到 200；错误密码或不存在邮箱得到 401。
4. 复制登录结果中的 accessToken，点击 Swagger 的 Authorize，填 Token 本身。
5. GET /auth/me 应返回刚注册的真实用户；移除 Token 后得到 401。

手动注册的测试账号会保存在本地数据库；自动化测试会清理本次运行自己创建的账号。
bknd/scripts/dev-token.mjs 已停用，并提示改用登录接口；旧 local-dev-user Token 不再满足用户查询要求。

## Postman

导入 postman/auth-api.postman_collection.json，按注册 → 登录 → 当前用户的顺序调试。
注册/登录正文自带公开的演示凭证，可自行更换；再次注册同一邮箱返回 409 是正常结果。
登录响应里的 accessToken 手动复制到本地环境变量 token，再发送“当前用户”请求。
不要把真实密码或 Token 保存进 Git 跟踪的 JSON/YAML 文件。

原环境验证集合的 05 请求已改为检查真实用户对象，需使用登录接口返回的 Token。
原生 Postman 的对应 YAML 断言也已更新。没有自动改写你的环境变量。

## 文件阅读顺序

1. src/auth/auth.dto.ts：输入规则、Swagger 请求与响应字段。
2. src/auth/auth.controller.ts：三条路由、HTTP 状态、校验和接口说明。
3. src/auth/auth.service.ts：注册哈希保存、登录验证与签发 JWT。
4. src/auth/auth.module.ts、auth.constants.ts：模块组装和 JWT 配置。
5. src/jwt-auth.guard.ts：验证凭证，并从数据库读取真实用户。
6. src/setup-app.ts：生产与 HTTP 测试共用的校验、CORS、Swagger 配置。
7. test/auth.e2e-spec.ts：真实数据库上的正常、异常和并发场景。
8. 第二步的 src/users/：账号存取与密码哈希逻辑继续复用。

## 验证命令

在 bknd 目录，保证 PostgreSQL 已运行且迁移完成：
```bash
npm run lint
npm run build
npm test
npm run test:e2e
```

第三步测试覆盖输入类型/空值/格式/长度/额外字段、密码原样处理、邮箱规范化、重复及并发注册、
真实登录与当前用户、用户删除、Token 篡改/过期/错误签发者/接收者/算法/缺少有效期、Swagger。
测试只清理自己本轮生成的随机邮箱，保留已有账号。

## 当前边界

本步提供本地 Bearer API；第四步在 Next.js 服务端增加 HttpOnly Cookie 适配，Nest 接口约定不变。
没有刷新 Token、服务端撤销/退出、邮箱验证、密码重置、角色权限和登录限流；退出时清除客户端凭证也不等于撤销已签发 JWT。
这些功能后续按项目要求增加，公开部署前需完善登录限流、HTTPS 和会话策略。
不需要模型 API、Redis 会话或新的云服务器即可测试本步骤。

参考：
- https://docs.nestjs.com/techniques/validation
- https://github.com/nestjs/jwt
- https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
