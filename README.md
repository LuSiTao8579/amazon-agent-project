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
AI 缓存默认连接 Compose 的 `redis://127.0.0.1:16379/0`，使用其他 Redis 实例时在 `bknd/.env` 设置 `REDIS_URL`。

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

### 后端（`bknd/`，完整 e2e 需要 PostgreSQL 和 Redis）

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

### AI 第三周联合交付

1. [只读工具联调与性能报告](docs/ai-week3-cache-performance.md) · 从聊天指令追到页面结果和审计，查看三个工具的冷、热查询实测。
2. [存储与审计核查记录](docs/ai-week3-storage-review.md) · 按方法核对 SQL 访问边界，再用真实请求对账四张 AI 表、审计增量和脱敏结果。
3. [写工具开发规范与七项验收矩阵](docs/ai-week3-write-tools.md) · 对照用户和公司业务接口，复跑普通用户、管理员的预校验与执行拦截。

安装前后端依赖和 Playwright Chromium，启动 Docker，并配置目标模型后，可在仓库根目录依次复跑本轮验收。浏览器脚本会自行构建并启动前后端，`target` 使用后端的模型配置，`benchmark` 使用固定模型。

```sh
bash bknd/scripts/verify-ai-foundation.sh
bash bknd/scripts/verify-ai-tools-browser.sh fixture
npm --prefix ftnd run typecheck
npm --prefix ftnd test
bash bknd/scripts/verify-ai-tools-browser.sh target
bash bknd/scripts/verify-ai-tools-browser.sh benchmark
```

### 分步文档与环境说明

- [AI Agent 第二周第一步 · 业务工具接入核对](docs/ai-tools-step-1.md) · 三个只读工具的 Service、权限、字段、接入缺口和待确认口径。
- [AI Agent 第二周第二步 · 工具开发规范](docs/ai-tools-step-2.md) · 从认证请求取得上下文，声明工具权限和输入 DTO，通过业务 Service 执行。
- [AI Agent 第二周第三步 · 工具返回与排序契约](docs/ai-tools-step-3.md) · 返回结构、页码与排序规则、错误码和联调样例。
- [AI Agent 第二周第四步 · 工具注册与动态开关](docs/ai-tools-step-4.md) · 工具发现、权限复核和 Redis 配置示例。
- [AI Agent 第二周第五步 · 工具执行审计](docs/ai-tools-step-5.md) · 审计字段、脱敏策略、可信 IP 和查询方式。
- [AI Agent 第二周第六步 · 公司基础查询](docs/ai-tools-step-6.md) · 组合筛选、工具与业务 API 对照、聊天折叠表格和人均年营收色阶。
- [AI Agent 第二周第七步 · 聊天调用工具](docs/ai-tools-step-7.md) · 自然语言查询、结构化历史、上下文摘要和重试验收。
- [AI Agent 第二周第八步 · 用户查询](docs/ai-tools-step-8.md) · 管理员查询、组合筛选、分页对照和权限验收。
- [AI Agent 第二周第九步 · Dashboard 综合指标](docs/ai-tools-step-9.md) · 成立年份、国家和等级筛选，指标卡与两种单图验收。
- [AI Agent 第二周第十步 · 聊天消息分发](docs/ai-tools-step-10.md) · 首次显示与历史恢复、报表选图、空结果及统一错误提示。
- [AI Agent 第二周第十一步 · 公司折叠表和 Dashboard 卡片](docs/ai-tools-step-11.md) · 两端共享行与卡片、独立展开、分页和窄屏验收。
- [AI Agent 第二周交付与验收](docs/ai-tools-step-12.md) · 两账号演示、工具参数与结果样例、开关、回归记录和第四个只读工具接入。
- [AI Agent 第一周交付与验收](docs/ai-foundation-step-12.md) · 后端配置、数据库升级、JWT 接口试用、Redis Key 和一键回归命令。
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
