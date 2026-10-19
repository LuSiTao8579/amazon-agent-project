# 第四步：真实注册、登录页面

## 本次完成

沿用 Next.js App Router、MUI 6.5.0 和第三步 NestJS 认证 API；没有修改数据库结构或后端密码规则。

- /signup：邮箱与密码输入、失焦/提交校验、重复邮箱提示、加载状态；只有 API 返回 201 才显示注册成功。
- 注册成功后进入 /login，显示后端返回的成功提示并预填邮箱；密码不会带到登录页。
- /login：真实验证账号密码；不存在的邮箱和错误密码统一显示“邮箱或密码错误”。
- 登录成功进入 /dashboard，显示从 /auth/me 获取的真实用户邮箱。
- 四个工作台页面每次服务端请求都会验证身份；未登录会跳到 /login。
- 增加最小退出入口，刷新页面可以恢复未过期的登录状态。
- 公司、订单、图表和用户管理仍是页面框架，不代表业务功能已经完成。

## 如何运行

先在一个终端启动基础服务与后端（已经运行时不要重复启动）：

```bash
cd /Users/lusitao/Desktop/amazon-agent-project
docker compose up -d --wait
cd bknd
npm run start:dev
```

在另一个终端启动前端：

```bash
cd /Users/lusitao/Desktop/amazon-agent-project/ftnd
npm ci
npm run dev
```

打开 http://127.0.0.1:3000/signup。请统一用 127.0.0.1，不要混用 localhost。

ftnd/.env.example 记录默认连接参数。不创建 .env.local 也能使用上述本地默认值。
需要改端口时，复制示例为 .env.local，修改 BACKEND_URL、APP_ORIGIN 并重启前端。
APP_ORIGIN 是浏览器访问的可信完整来源；Origin 不一致的提交会被拒绝。
这些是 Next 服务端参数，不使用 NEXT_PUBLIC_，也不需要复制数据库密码或模型 API Key。

## 请求是如何流动的

浏览器 MUI 表单 → Next.js 的 /api/auth/signup 或 /api/auth/login → NestJS 的 /auth/signup 或 /auth/login → PostgreSQL。

Next 的接口只适配浏览器与 Cookie，不重写用户业务。真正的输入校验、密码哈希与验证、用户读写、JWT 签发仍在 Nest。

登录成功时，Next 将 JWT 放在 HttpOnly、SameSite=Lax、Path=/ 的 Cookie 中，生命周期取后端 expiresIn（目前 900 秒）。
浏览器收到的 JSON 只有公开 user 信息，不包含 accessToken；代码不把 Token 写进 localStorage 或 sessionStorage。
服务端请求 /auth/me 时，才从 Cookie 取 JWT 转成 Authorization: Bearer 请求头。

本地 APP_ORIGIN 为 HTTP，所以 Cookie 不设置 Secure；部署 HTTPS 时必须设置真实的 HTTPS APP_ORIGIN，自动启用 Secure。
所有认证接口响应均 no-store；写操作校验可信 Origin 并要求 application/json，降低跨站请求风险。
这些措施不代表已经达到生产上线要求。

## 输入与错误提示

| 情况 | 页面行为 |
| --- | --- |
| 邮箱/密码为空 | 对应输入框红色提示，焦点移到第一个错误字段 |
| 邮箱不合法或过长 | 显示格式/长度提示；使用和后端相同版本的 validator 邮箱校验 |
| 注册密码少于 15、多于 128 个字符，或全部空白 | 显示密码规则，不发送注册请求 |
| 登录密码为空或多于 128 个字符 | 显示输入错误；不强迫已有账号符合新的注册最小长度 |
| 重复邮箱（409） | 展示后端提示，并在邮箱字段提示可直接登录 |
| 不存在邮箱/密码错误（401） | 两种情况统一显示“邮箱或密码错误” |
| 后端校验失败（400） | 展示后端 message；支持字符串和消息数组 |
| 后端未启动/网络超时 | 可读错误提示，按钮恢复，不假报成功 |
| 请求处理中 | 禁用表单和提交按钮，用同步锁阻止重复提交 |

邮箱 trim 并转小写；密码原样发送，不 trim、不截断、不禁止符号。
长度按 Unicode 码点统计，emoji 不错误地按两个字符计算。
没有设置会静默截断密码的 maxlength。注册成功提示只保存在内存，不通过 URL 伪造，也不存密码。

## 推荐阅读顺序

1. ftnd/src/components/auth-form.tsx：MUI 表单、输入错误、加载状态、调用接口与跳转。
2. ftnd/src/lib/auth-validation.ts：前端规则，对照 bknd/src/auth/auth.dto.ts 阅读。
3. ftnd/src/lib/auth-contract.ts：公开用户类型、响应检查与错误消息处理。
4. ftnd/src/app/api/auth/ 下的 route.ts：浏览器访问的四条路由。
5. ftnd/src/lib/auth-server.ts：转发到 Nest、Cookie、可信来源与服务器故障处理。
6. ftnd/src/components/registration-feedback.tsx：注册成功跨页面提示，只有非敏感邮箱和消息。
7. ftnd/src/components/authenticated-workspace.tsx、logout-button.tsx：读取真实用户、页面保护和退出。
8. ftnd/src/app/login/page.tsx、signup/page.tsx 与四个业务 page.tsx：将组件接到路由。
9. ftnd/src/app/providers.tsx、layout.tsx、error.tsx：共享提示、页面元数据、服务不可用兜底。
10. ftnd/tests/auth.test.mjs、auth.integration.mjs：校验边界与真实 API 流程测试。
11. ftnd/.env.example、package.json、package-lock.json：配置说明、脚本及精确依赖。
12. docs/frontend-environment.md、auth-step-3.md：已同步第四步当前状态。

原 auth-preview.tsx 已删除，以 auth-form.tsx 替代，不再保留禁用表单。

## 自己验收

1. 打开注册页，空提交，检查邮箱和密码提示。
2. 输入非法邮箱、短密码，检查字段提示。
3. 使用没有注册过的测试邮箱与 15–128 字符密码注册：跳登录页，显示注册成功。
4. 使用同一邮箱重复注册：显示已注册。
5. 输入错误密码登录：显示“邮箱或密码错误”；使用正确密码：进入 Dashboard，显示真实邮箱。
6. 刷新 Dashboard，仍显示当前用户；点击导航，能到其他受保护的占位页。
7. 点击退出登录，再手动访问 /dashboard，应回到登录页。
8. 使用手机宽度查看布局，检查输入框、提示及按钮没有横向溢出。
9. 后端不可用时提交，不应出现注册/登录成功；恢复后可重试。

手动注册的账号会保存在本地数据库。请勿使用真实公司账号或常用密码做测试。

## 自动测试

在 ftnd 目录：

```bash
npm run lint
npm test
npm run build
npm run typecheck
```

开启前端 3000、后端 3001 和本地 PostgreSQL 后：

```bash
npm run test:integration
```

集成测试复用 bknd 的 pg、dotenv 依赖读取本地连接配置；会创建唯一的 step4-http- 测试邮箱，
结束时只清理这个测试账号，不删除已有用户、不重置数据库。
测试覆盖真实注册/重复注册/登录/当前用户/退出、页面访问保护、Cookie 属性、跨站请求、非法输入和已删除用户。

## 当前边界

- 仍是本地开发环境，不要直接公开部署。
- 15 分钟后需要重新登录；没有刷新 Token 或“记住我”。
- 退出只清除当前浏览器 Cookie，不撤销已经签发的 JWT。
- 当前未实现邮箱验证、忘记密码、角色权限、登录限流、跨标签页自动同步和完整生产会话策略。
- 本次只补最小会话闭环；更完整的导航与业务布局在后续步骤继续。
- 未提交 Git 或推送 GitHub。
- 2026-10-19 npm audit 报告 5 项高危告警，均在现有 eslint-config-next → fast-glob → micromatch → braces 开发依赖链；
  npm audit --omit=dev 检查为 0。未执行会降级框架配置的 audit fix --force，需后续单独评估兼容修复。

参考：
- [MUI v6 TextField 校验](https://v6.mui.com/material-ui/react-text-field/#validation)
- Next.js 当前安装版本文档：ftnd/node_modules/next/dist/docs/01-app/ 下的 Route Handlers、cookies、Server and Client Components。
