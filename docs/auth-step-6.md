# 第六步：先测 API、再测网页整条流程与提交前检查

## 一、先测 API（Swagger / Postman / 后端 E2E）

### 1. Swagger 检查（`http://127.0.0.1:3001/docs`）
- 页面标题为 **供应链工作台 API（v0.6.0）**，清楚展示：
  - `POST /auth/signup`：201 创建用户、400 输入不合法、409 邮箱已注册
  - `POST /auth/login`：200 返回短期 Bearer JWT 与公开用户、400 输入不合法、401 邮箱或密码错误
  - `GET /auth/me`：需 Bearer Token，200 返回数据库中的当前用户、401 凭证缺失/无效/过期或用户已不存在
- Schema 检查：`SignupDto` 标注密码 15–128 字符，`PublicUserDto` 仅包含 `id`、`email`、`createdAt`、`updatedAt`，**不暴露 `password` 或 `passwordHash`**。

### 2. Postman 集合验证（`postman/auth-api.postman_collection.json`）
按 `01` → `08` 顺序执行，覆盖全部后端验收项：
1. `01 — 注册：非法输入被拦截（400）`：非法邮箱与短密码返回 `400` 及错误消息数组。
2. `02 — 注册：合法新邮箱（首次 201 / 重复 409）`：首次注册返回 `201`，不自动签发 Token，不返回密码或哈希。
3. `03 — 注册：重复邮箱被拒绝（409）`：大小写变体或相同邮箱再次注册返回 `409`（`该邮箱已注册`）。
4. `04 — 登录：不存在的邮箱被拒绝（401）`：返回 `401`（`邮箱或密码错误`）。
5. `05 — 登录：错误密码被拒绝（401）`：返回 `401`（`邮箱或密码错误`，与不存在邮箱完全一致）。
6. `06 — 登录：正确密码签发 JWT（200）`：返回 `200` 与 `accessToken`（`expiresIn: 900`），脚本自动将 `accessToken` 写入当前 Postman 环境的 `token` 变量。
7. `07 — 当前用户：有效 JWT 返回真实用户（200）`：携带 `{{token}}` 请求 `GET /auth/me` 返回 `200` 与真实用户公开字段。
8. `08 — 当前用户：无效或过期 JWT 被拒绝（401）`：携带无效 Token 请求 `GET /auth/me` 返回 `401`。

### 3. 后端自动化测试（`bknd`）
在 `bknd/` 执行 `npm run lint && npm run build && npm test && npm run test:e2e`：
- 覆盖 `app.e2e-spec.ts`、`users.e2e-spec.ts`、`auth.e2e-spec.ts`，直接连接真实 PostgreSQL 验证用户创建、唯一约束、并发冲突、Argon2id 哈希存储、JWT 签发与篡改/过期拦截、Swagger Schema。

---

## 二、再测网页整条流程（浏览器交互 + 全链路集成测试）

在 `http://127.0.0.1:3000` 浏览器及 `ftnd/tests/auth.integration.mjs` 中逐项核对以下 8 条核心标准：

| 检查项 | 预期表现与验证结果 |
| --- | --- |
| 1. 空邮箱、空密码、错误邮箱格式有正确提示 | 前端失焦/提交时通过 MUI `TextField` 的 `error` 和 `helperText` 显示具体中文错误并聚焦首个错误项；绕过前端直调 API 时后端同样返回 `400`。 |
| 2. 合法的新邮箱可以注册，并真实写入数据库 | 注册返回 `201` 后跳转 `/login`，显示绿色成功 `Alert` 并预填邮箱；查询 PostgreSQL `users` 表可见对应记录。 |
| 3. 重复邮箱注册有正确处理 | 使用已注册邮箱（含大小写或首尾空格差异）提交时，后端返回 `409`，页面显示“该邮箱已注册”并在邮箱输入框下方提示直接登录。 |
| 4. 正确密码可以登录；不存在的邮箱和错误密码不能登录 | 不存在邮箱与错误密码均返回 `401` 并显示“邮箱或密码错误”；正确密码返回 `200`，服务端写入 `HttpOnly` Cookie 并进入 `/dashboard`。 |
| 5. 注册失败、接口异常或网络失败时，页面不会误报成功 | 400/401/409/502 或后端未启动/超时均留在当前页展示错误 `Alert`，恢复按钮可重试，绝不假报成功或伪造跳转。 |
| 6. 四个导航入口可以切换 | 顶部共享导航栏 `Dashboard · Company · Order · User` 由 `routes.ts` 统一生成，点击可切换页面，`usePathname()` 自动高亮当前所在入口（`aria-current="page"`），各页展示清晰标题与模块占位，无假统计数据。 |
| 7. 刷新、退出、凭证失效后的行为符合约定 | 刷新工作台页面通过服务端 Cookie + `GET /auth/me` 恢复真实用户状态；点击“退出登录”或 Cookie 失效/用户被删后访问任意受保护页面均重定向回 `/login`。 |
| 8. 数据库不保存明文密码，接口不返回密码或密码哈希 | PostgreSQL `users.password_hash` 仅存 `$argon2id$` 哈希（带数据库 CHECK 约束兜底）；`/auth/signup`、`/auth/login`、`/auth/me` 及前端 `/api/auth/*` 均只返回 `id`、`email`、`createdAt`、`updatedAt`。 |

---

## 三、提交内容与仓库安全检查清单

- [x] **配置文件安全**：根目录 `.env`、`bknd/.env` 均未被 Git 跟踪；`.env.example` 与 `bknd/.env.example`、`ftnd/.env.example` 仅含占位符。
- [x] **无密钥与无真实数据**：代码、测试与 Postman 文件中不包含真实密码、`JWT_SECRET`、有效 JWT 或真实公司业务数据。
- [x] **构建与临时文件忽略**：`node_modules/`、`dist/`、`.next/`、`.DS_Store` 均被 `.gitignore` 忽略。
- [x] **仓库公开性确认提醒**：推送至公开 GitHub 仓库前，需先与公司 / Leader 确认项目代码是否允许公开。
