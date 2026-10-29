# 第六步：联调、验收与学习索引

## 已做验证
- 后端55项集成测试通过，包含普通账号403、User增查改删、公司CRUD、关联删除409、员工0时指标null。
- 前端25项单元测试通过；Next生产构建、TypeScript检查通过。
- Next→Nest→PostgreSQL认证全链路13项通过，包含Cookie、跨域拦截、页面权限和退出登录。
- 浏览器使用临时管理员验证了登录、用户列表真实数据、编辑保存成功、公司2000条分页数据及展开详情。
- 浏览器没有逐一覆盖所有筛选组合和每种删除情形；核心CRUD与权限由接口测试覆盖。

## 六步阅读顺序
1. management-step-1.md：字段含义和业务规则。
2. management-step-2.md + migrations/0002_management_tables.sql：增量迁移与外键。
3. management-step-3.md + scripts/import-companies.mjs：解析CSV、事务、防重复。
4. management-step-4.md + src/users/user-management.*：用户管理接口与页面。
5. management-step-5.md + src/companies/*：公司查询、折叠信息、人均营收。
6. management-api.md + test/management.e2e-spec.ts：权限与异常验证。
前端共享表格在ftnd/src/components/management-table.tsx，代理在ftnd/src/app/api/manage/[...path]/route.ts。

## 本地运行
根目录启动 docker compose up -d --wait。
第一个终端进入bknd执行 npm run start:dev。
第二个终端进入ftnd执行 npm run dev。
打开 http://127.0.0.1:3000 ，用原有管理员账号和原密码登录。

## 演示数据
已有3个停用的演示用户，岗位分别是Member、Manager、Analyst，不提供可登录的公共默认密码。
在bknd执行 node scripts/seed-demo-users.mjs 可重复准备演示用户。
公司和关系各2000条。个人管理员邮箱和数据库备份不写入仓库。

## 自己操作学习
在User中新增一个测试用户，筛选岗位，编辑姓名，刷新确认保留，再选中并删除。
在Company中搜索名称、选择等级、展开详情；新增无关联公司可体验编辑删除。
对导入且有关联的公司删除会提示409，这是保护关系数据的规则。
用Postman或Swagger对照网页请求，理解“页面→代理→控制器→服务→数据库”的完整路径。

## 当前边界
岗位、状态、色阶是开发约定；币种和开始供应日期需要真实业务定义。
数据库已有管理权限与关联删除保护；没有新增关系编辑页面、邀请邮件或密码重置功能。
Dashboard/Order保持原有占位页，它们不在本次User/Company任务范围。
生产上线还需要单独评估访问策略、审计、备份和运维配置，本次交付是本地开发版本。
