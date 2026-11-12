# AI 聊天第 9 步：Agent 任务进度页面

## 本步做了什么

登录工作台后，导航栏新增 **Agent Tasks · 任务进度**。页面展示任务名称、状态、进度和创建时间的模拟表格。页面已明确标注模拟数据；当前没有接入真实任务、执行记录或任务编排。

## 跟着代码看

1. `ftnd/src/config/routes.ts`：`routes.agentTasks` 定义 URL；`workspaceSections.agentTasks` 让共享导航自动生成入口。
2. `ftnd/src/app/(workspace)/agent-tasks/page.tsx`：Next.js 根据文件目录创建 `/agent-tasks` 路由；`requireUser()` 让未登录访问跳转到登录页。
3. `ftnd/src/components/agent-tasks.tsx`：`demoTasks` 是写在前端的演示数组；MUI 表格、Chip 和 LinearProgress 显示名称、状态、进度和时间。窄屏下表格可横向滚动。
4. `ftnd/tests/auth.test.mjs` 和 `ftnd/tests/auth.integration.mjs`：检查导航配置、未登录访问、五个页面及模拟数据标识。

## 自己操作验证

启动 Docker、Nest 后端与 Next 前端。登录后点击 **Agent Tasks · 任务进度**，查看模拟数据提示和表格；然后点击其他导航项，确认页面正常。打开聊天窗口后切换到此页面，入口仍在共享工作台中。退出登录后直接访问 `/agent-tasks` 应跳转到登录页。

这里不需要新增数据库表或 API：本步只提供演示页面，真实任务状态需要后续任务系统提供。
