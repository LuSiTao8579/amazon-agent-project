# NestJS 后端环境

## 启动与访问

先在项目根目录运行 docker compose up -d --wait，然后：
```bash
cd /Users/lusitao/Desktop/amazon-agent-project/bknd
npm run db:migrate -- --status
npm run start:dev
```
新数据库需先执行 npm run db:migrate。

- http://127.0.0.1:3001/ 返回 Hello World!
- /health 返回进程状态，不检测数据库或模型。
- /docs 为 Swagger 交互文档，/docs-json 为 OpenAPI JSON。
- POST /auth/signup：邮箱密码注册。
- POST /auth/login：登录并返回 15 分钟 Bearer JWT。
- GET /auth/me：凭证验证通过后返回数据库中的真实用户。

接口请求、响应和校验规则见 [第三步说明](auth-step-3.md)。
旧 scripts/dev-token.mjs 已停用，请通过真实登录获取 Token。

## 文件阅读顺序

1. bknd/package.json：启动、构建、测试和迁移命令。
2. src/main.ts、setup-app.ts：端口、CORS、请求校验、Swagger。
3. src/app.module.ts：加载配置并组装数据库、认证等模块。
4. src/auth/：DTO、接口、业务流程及 JWT 配置。
5. src/users/：用户表访问和 Argon2id 密码校验。
6. src/jwt-auth.guard.ts：验证 JWT 并查询真实用户。
7. src/environment.controller.ts：健康检查。
8. test/auth.e2e-spec.ts：真实数据库的认证 HTTP 测试。

## 检查

```bash
npm run lint
npm run build
npm test
npm run test:e2e
```

使用 Node 24、ESM、Oxlint 和 Vitest。e2e 测试需要数据库运行且迁移完成。
根目录 .env 放数据库配置；bknd/.env 放 DATABASE_URL 和 JWT_SECRET；agent/.env 放模型配置，均不提交。
前端端口 3000，后端端口 3001，仅监听本机。Python Agent 尚未接入业务接口。
