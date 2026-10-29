# 用户和公司管理 API

这一步提供前端表格需要的数据接口。控制器接收请求，DTO 校验输入，Service 用参数化 SQL 读写 PostgreSQL。

- 用户：GET /users（search、roles、page、pageSize）、GET /users/:id、POST /users、PATCH /users/:id、DELETE /users/:id、POST /users/bulk-delete。
- 公司：GET /companies（search、levels、page、pageSize）、GET /companies/:code、POST /companies、PATCH /companies/:code、DELETE /companies/:code。
- JWT 守卫从数据库重新读取账号状态；用户管理仅管理员可用，公司查询需登录，写入需管理员。
- 密码使用 Argon2id 哈希，响应不包含密码或哈希；批量删除先锁定并检查全部账号，失败时回滚。
- 公司仍被供应链关系引用时返回 409，避免误删关联。员工数为 0 时人均年营收为 null。

在 bknd 运行 `npm run test:e2e`：测试使用独立临时账号和公司，结束时只清理自身创建的数据。
API 已完成初步回归；表格页面和浏览器联调仍需后续完成。
