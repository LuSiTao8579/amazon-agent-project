# 第七步：联调与学习

浏览器调用 Next /api/manage/dashboard，代理从 HttpOnly Cookie读取Token，再调用 Nest GET /dashboard；后端查询PostgreSQL。
完整链路测试在ftnd/tests/auth.integration.mjs，验证匿名拒绝、登录请求、公司总数、等级数量及年度末累计的对照。
后端测试：npm test 和 npm run test:e2e；前端：npm run lint、npm run typecheck、npm test、npm run build 和 npm run test:integration。

## 手动体验
项目根目录启动 docker compose up -d --wait；分别进入bknd运行 npm run start:dev、ftnd运行 npm run dev。
登录后进入Dashboard。鼠标悬停环形图和折线图查看数据；环形图下方有数量和百分比表。
到Company新增或编辑一条测试公司，返回Dashboard或点击刷新，四张卡片及图表重新查询。删除测试公司后再刷新。

## 阅读顺序
1. dashboard-step-1.md：统计口径及接口结构。
2. bknd/src/dashboard/dashboard.service.ts：一次SQL统计、按年补齐累计。
3. dashboard.service.spec.ts 和 bknd/test/management.e2e-spec.ts：用样本和真实数据库验证。
4. ftnd/src/components/dashboard.tsx：数据请求、卡片、空状态和刷新。
5. level-chart.tsx：Chart.js环形图、Tooltip与数据表。
6. growth-chart.tsx：成立年份累计折线图与Tooltip。
7. ftnd/tests/auth.integration.mjs：跨前后端验证。

成立年份不等于真实加入供应链日期；收入CSV未说明币种；当前页面刷新是手动或重新进入，不是实时推送。
