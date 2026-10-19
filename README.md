# 供应链工作台 · Agent 全栈开发项目

全栈开发与 Agent 项目工程，当前已完成数据库环境、NestJS 用户与认证 API、Next.js + MUI v6 注册登录页面、可扩展工作台共享导航及前后端全链路集成验收。

## 技术栈

- **前端（`ftnd/`）**：Next.js 16（App Router）、React 19、TypeScript、Material UI v6（6.5.0）
- **后端（`bknd/`）**：NestJS 12 REST API、Swagger（OpenAPI）、JWT（HS256）、Argon2id 密码哈希、`pg` 连接池
- **Agent（`agent/`）**：Python、LangGraph（后续阶段接入业务与模型 API）
- **基础设施（`compose.yaml`）**：PostgreSQL 17 + pgvector（本机 `127.0.0.1:15432`）、Redis 7（本机 `127.0.0.1:16379`）
- **调试与测试**：Swagger UI、Postman 集合、Vitest + Supertest（后端）、Node Test Runner（前端单元与全链路集成测试）

## 快速启动与运行顺序

### 1. 启动本地数据库（需先打开 Docker Desktop）

```bash
cd /Users/lusitao/Desktop/amazon-agent-project
docker compose up -d --wait
docker compose ps
```

首次运行请参考 `.env.example` 创建根目录 `.env`（设置 `POSTGRES_PASSWORD`），并在 `bknd/.env`（参考 `bknd/.env.example`）中配置 `JWT_SECRET` 与 `DATABASE_URL`。

### 2. 执行数据库迁移并启动 NestJS 后端（端口 3001）

```bash
cd /Users/lusitao/Desktop/amazon-agent-project/bknd
npm install
npm run db:migrate
npm run start:dev
```

- API 地址：`http://127.0.0.1:3001`
- Swagger 文档：`http://127.0.0.1:3001/docs`（OpenAPI JSON：`http://127.0.0.1:3001/docs-json`）

### 3. 启动 Next.js 前端（端口 3000）

另开一个终端窗口：

```bash
cd /Users/lusitao/Desktop/amazon-agent-project/ftnd
npm install
npm run dev
```

- 浏览器打开：`http://127.0.0.1:3000`（请统一使用 `127.0.0.1:3000`，不要混用 `localhost`，以匹配可信 `Origin` 校验）
- 页面路由：`/signup`（注册）、`/login`（登录）、`/dashboard` · `/company` · `/order` · `/user`（共享导航工作台页面）

## 自动化测试与检查命令

### 后端（`bknd/`，需 PostgreSQL 已运行）

```bash
cd /Users/lusitao/Desktop/amazon-agent-project/bknd
npm run lint
npm run build
npm test
npm run test:e2e
```

### 前端（`ftnd/`，`test:integration` 需前后端与 PostgreSQL 同时运行）

```bash
cd /Users/lusitao/Desktop/amazon-agent-project/ftnd
npm run lint
npm test
npm run typecheck
npm run build
npm run test:integration
```

## 文档索引

- 环境与工具说明：
  - [本地数据库环境](docs/local-databases.md)
  - [NestJS 后端环境](docs/backend-environment.md)
  - [Next.js 前端环境](docs/frontend-environment.md)
  - [Postman 接口调试](docs/postman-environment.md)
- 分步实施与验收文档：
  - [第 1 步：账号页面与接口范围](docs/auth-step-1.md)
  - [第 2 步：用户表与 NestJS 数据库连接](docs/auth-step-2.md)
  - [第 3 步：注册、登录和真实用户认证 API](docs/auth-step-3.md)
  - [第 4 步：真实注册、登录页面](docs/auth-step-4.md)
  - [第 5 步：可扩展导航与登录后的工作台页面框架](docs/auth-step-5.md)
  - [第 6 步：API 与网页整条流程验收及提交检查](docs/auth-step-6.md)

## 仓库公开性与安全规范（重要）

1. **确认代码公开权限**：如果计划将代码推送到公开 GitHub 仓库，**必须先与公司 / Leader 确认项目代码是否允许公开**；未获明确许可前请仅在本地提交或使用受控私有仓库，且绝不包含任何实习/公司内部资料或真实业务数据。
2. **严禁提交密钥与凭证**：
   - 根目录 `.env`、`bknd/.env`、`ftnd/.env.local`、`agent/.env` 均由 `.gitignore` 忽略，不得强制添加。
   - `.env.example` 与 Postman 集合/环境文件只保留占位符或公开演示测试值，不得写入真实数据库密码、`JWT_SECRET`、模型 API Key 或有效登录 Token。
3. **每次提交前自检**：
   ```bash
   git status
   git diff --stat
   ```
   确认暂存区不含 `.env`、`node_modules`、`dist`、`.next`、`.DS_Store` 或任何敏感信息。
