# 第五步：可扩展导航与登录后的工作台页面框架

## 本次完成的内容

在第四步真实注册/登录与会话闭环的基础上，将四个工作台页面升级为**统一配置驱动的可扩展导航 + Next.js 共享布局（Route Group）+ 结构化页面占位框架**：

1. **菜单统一配置（单一数据源）**
   - 在 `ftnd/src/config/routes.ts` 中集中定义 `workspaceSections` 并导出有序导航列表 `workspaceNavItems`（`Dashboard` · `Company` · `Order` · `User`）及路径匹配函数 `isActiveWorkspacePath`。
   - 工作台顶部导航栏（`WorkspaceShell`）与注册/登录页左侧模块说明（`AuthForm`）均从 `workspaceNavItems` 遍历生成；后续新增第 5 个业务入口只需修改 `routes.ts`，无需到处改动组件。
2. **各页面共用同一个导航布局**
   - 新增 Next.js App Router 路由组 `ftnd/src/app/(workspace)/layout.tsx`，将 `/dashboard`、`/company`、`/order`、`/user` 纳入同一个共享布局 `WorkspaceShell`，同时不改变原有 URL 路径，也不影响 `/login` 和 `/signup`。
   - 顶部共享区域包含品牌标题、已验证的当前登录邮箱、退出登录按钮，以及四个模块导航入口。
3. **点击切换页面并高亮当前位置**
   - `WorkspaceShell` 使用 `usePathname()` 与 `isActiveWorkspacePath(pathname, item.href)` 自动判断当前所在模块。
   - 当前所在入口自动切换为实心高亮（`variant="contained"`）并设置无障碍属性 `aria-current="page"`；其余入口为 `variant="outlined"`。
4. **四个页面先有标题和明确的占位内容，不伪造业务统计数据**
   - 新增 `WorkspacePageContent`（替代原先临时的 `workspace-preview.tsx`），为 `Dashboard`、`Company`、`Order`、`User` 渲染各自的标题、副标题、职责说明，以及 3 个规划模块占位卡片。
   - 不包含任何虚构图表、假订单数字或假公司列表；`User` 页面额外展示来自后端 `GET /auth/me` 的真实用户邮箱与 UUID。
5. **完整认证与会话闭环**
   - **登录成功后进入 Dashboard**：登录接口返回 200 后进入 `/dashboard`。
   - **刷新页面恢复/检查登录状态**：服务端读取 `HttpOnly` Cookie 并向 NestJS `GET /auth/me` 验证真实用户；借助 React `cache()`，同一次服务端渲染中 `layout.tsx` 与 `page.tsx` 共用一次 `/auth/me` 请求。
   - **切换导航与未登录拦截**：每个工作台 `page.tsx` 均在服务端执行 `requireUser()`，导航链接设置 `prefetch={false}`，保证无论是直接访问、刷新页面还是点击导航切换，凭证缺失/过期/用户被删都会跳转到 `/login`。
   - **退出登录**：点击右上角“退出登录”清除 `HttpOnly` Cookie 并回到 `/login`，再次访问任意受保护页面均被拦截。
   - **后端受保护接口仍验证身份**：NestJS `GET /auth/me` 仍由 `JwtAuthGuard` 验证签名、有效期、签发者/接收者并查询 PostgreSQL `users` 表，绝不仅靠前端隐藏菜单。

## JWT 传递与保存设计总结

| 环节 | 实现方式 | 目的 |
| --- | --- | --- |
| NestJS 签发 (`POST /auth/login`) | 校验邮箱与 Argon2id 密码哈希后签发 HS256 JWT（`sub` 为用户 UUID，有效期 900 秒） | 后端统一掌控身份签发 |
| 浏览器保存 (`POST /api/auth/login`) | Next 服务端将 `accessToken` 写入 `HttpOnly; SameSite=Lax; Path=/; Max-Age=900` Cookie，响应 JSON 仅返回公开 `user` | 避免将 JWT 暴露给前端 JS、`localStorage` 或 URL |
| 服务端验证 (`GET /auth/me`) | Next 服务端从 Cookie 取出 Token，以 `Authorization: Bearer <token>` 转发给 NestJS `GET /auth/me` | 每次受保护页面访问或刷新均由后端验证真实身份 |
| 退出登录 (`POST /api/auth/logout`) | 校验可信 `Origin` 后返回 `Max-Age=0` 清除浏览器 Cookie | 立即终止当前浏览器会话 |

## 文件阅读顺序

1. `ftnd/src/config/routes.ts`：路由常量、四个模块的标题/说明/占位模块定义、`workspaceNavItems` 导出与 `isActiveWorkspacePath` 匹配逻辑。
2. `ftnd/src/app/(workspace)/layout.tsx`：四个工作台页面的共享服务端布局入口。
3. `ftnd/src/components/workspace-shell.tsx`：共享导航栏、当前位置高亮（`usePathname` + `aria-current="page"`）、当前登录邮箱展示与退出按钮。
4. `ftnd/src/components/workspace-page-content.tsx`：四个工作台页面的结构化标题与模块占位内容。
5. `ftnd/src/app/(workspace)/dashboard/page.tsx`、`company/page.tsx`、`order/page.tsx`、`user/page.tsx`：四个受保护页面的路由入口与服务端身份验证。
6. `ftnd/src/lib/auth-server.ts`：带请求级 `cache()` 的 `currentUser()` 与 `requireUser()` 服务端守卫。
7. `ftnd/tests/auth.test.mjs`、`ftnd/tests/auth.integration.mjs`：导航配置单测与四页面共享导航端到端集成测试。

## 验证命令

在 `ftnd` 目录执行：

```bash
npm run lint
npm test
npm run typecheck
npm run build
```

在 PostgreSQL（15432）、后端 `bknd`（3001）与前端 `ftnd`（3000）均运行时执行：

```bash
npm run test:integration
```
