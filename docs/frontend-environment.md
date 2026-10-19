# 前端环境使用指南

## 启动

```bash
cd /Users/lusitao/Desktop/amazon-agent-project/ftnd
node --version
npm run dev
```

使用 Node.js 24 LTS。打开 http://127.0.0.1:3000，默认进入 /login。
注册、登录现已接入真实 NestJS API，需同时启动 3001 端口的后端与 PostgreSQL。
操作及验收见 [第四步说明](auth-step-4.md)。请统一使用 127.0.0.1:3000，不要混用 localhost。
终端按 Control+C 停止。修改页面保存后浏览器自动更新。
Mac 已通过 Homebrew 安装并链接 Node.js 24；原 npm 保存在 /opt/homebrew/lib/node_modules/npm-backup-20261005。
其他电脑可通过自己的版本管理工具安装 Node 24，再运行 npm ci。
.nvmrc 记录版本要求，但不会自动安装或切换 Node。

## 阅读顺序

1. ftnd/package.json：依赖和 dev/build/start/lint/typecheck 命令。
2. ftnd/src/app/page.tsx：默认入口跳转 /login；各路由子目录的 page.tsx 是页面入口。
3. ftnd/src/app/layout.tsx：全局页面框架、标题、中文语言标记。
4. ftnd/src/app/providers.tsx：连接 MUI 主题、基础样式和服务端样式缓存。
5. ftnd/src/theme.ts：颜色、字体、圆角；使用系统字体，无需下载 Google 字体。
6. ftnd/tsconfig.json 和 eslint.config.mjs：TypeScript 与代码检查规则。
7. ftnd/package-lock.json：实际依赖版本，提交 Git，不手动编辑。

## 版本说明

MUI 主组件 @mui/material 与图标 @mui/icons-material 固定 6.5.0。
@mui/material-nextjs 是独立的 Next.js 样式适配包，采用支持 Next.js 16 的版本；其版本号不代表 MUI 主组件升级。
Next.js 使用 App Router，页面目录在 src/app。不使用 Tailwind。

## 验证命令

```bash
npm run lint
npm run typecheck
npm run build
npm start
```

build 创建生产构建，start 运行构建后的服务；start 和 dev 不要同时占用 3000 端口。
node_modules 和 .next 是本地依赖/构建产物，不提交 Git。
前端目前没有模型调用，真实 API Key 继续留在 agent/.env，不能放进 NEXT_PUBLIC_ 变量。
用户表、真实注册登录 API 和浏览器认证流程已实现；公司、订单、图表等业务仍待后续开发。
