# NestJS 后端环境

## 启动与访问

```bash
cd /Users/lusitao/Desktop/amazon-agent-project/bknd
npm run start:dev
```

- http://127.0.0.1:3001/ 返回 Hello World!
- http://127.0.0.1:3001/health 返回后端进程状态（不检测数据库和模型）。
- http://127.0.0.1:3001/docs 为 Swagger 交互式 API 文档。
- http://127.0.0.1:3001/docs-json 为 OpenAPI 文档，可导入 Postman。
- GET /auth/me 是 JWT 保护的测试接口，没有 Token 返回 401。

## 文件阅读顺序

1. bknd/package.json：依赖、启动、构建、检查和测试命令。
2. bknd/src/main.ts：启动端口、前端 CORS、参数校验、Swagger。
3. bknd/src/app.module.ts：组装模块、加载环境变量、配置 JWT。
4. bknd/src/app.controller.ts 和 app.service.ts：Controller 接收请求，Service 提供业务逻辑。
5. bknd/src/environment.controller.ts：健康检查和 JWT 示例接口。
6. bknd/src/jwt-auth.guard.ts：从请求头取 Token，验证签名、有效期、签发者和接收者。
7. bknd/.env.example：配置示例。真实 JWT_SECRET 在 bknd/.env 中，不能提交。
8. bknd/test/app.e2e-spec.ts：接口和 JWT 拒绝/通过的自动化测试。

## 手动验证 JWT

在 bknd 目录运行：

```bash
node scripts/dev-token.mjs
```

这会在本地生成有效期 15 分钟的测试 Token。复制它，在 Swagger 点击 Authorize，填入 Token，然后执行 GET /auth/me，应返回 local-dev-user。
Postman 可选 Authorization → Bearer Token，粘贴同一个 Token。
该脚本仅用于本地验证；没有提供公开的 Token 签发接口，也没有实现正式注册、登录、用户数据库或权限管理。

## 检查命令

```bash
npm run lint
npm run build
npm test
npm run test:e2e
```

本项目使用 Node 24 LTS。当前 NestJS 脚手架采用 ESM、Oxlint 和 Vitest，与旧教程的 CommonJS/ESLint/Jest 可能不同。
根目录 .env 放数据库密码；agent/.env 放模型配置；bknd/.env 放后端配置。
前端端口 3000，后端端口 3001。后端仅监听本机。
尚未接入数据库或 Python Agent；下一阶段可以进行业务联调。
