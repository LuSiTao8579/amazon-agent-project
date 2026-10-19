# 第二步：用户表与 NestJS 数据库连接

## 本次落实的内容

- PostgreSQL 新增 `users` 表（通过**迁移脚本**创建，不改 `init.sql`、不删数据卷）。
- NestJS 通过 `pg` 连接池连接数据库，启动时检查连通性。
- `UsersModule` 提供创建用户、按邮箱查找、按 id 读取、读取登录凭证四个方法。
- 密码使用 **Argon2id** 哈希；数据库只存哈希，返回给调用方的用户对象不含哈希。
- 用真实数据库的自动化测试验证：能创建/查询用户，相同邮箱（含大小写不同、并发）不能重复插入。

当前状态：**还没有新增 HTTP 接口**。`POST /auth/signup`、`POST /auth/login`、真实的 `GET /auth/me` 在第三步实现；前端页面也未改动。

## users 表结构

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid，主键 | `gen_random_uuid()` 自动生成，不暴露自增序号 |
| email | text，NOT NULL，UNIQUE | 保存前 trim + 转小写；CHECK 约束保证库里只有规范化邮箱 |
| password_hash | text，NOT NULL | 只接受 `$argon2id$` 开头的哈希串，CHECK 约束拦截明文 |
| created_at | timestamptz | 默认 `now()` |
| updated_at | timestamptz | 默认 `now()`；触发器在每次 UPDATE 时自动刷新 |

另有 `schema_migrations` 表，记录哪些迁移文件已经执行过。

### 为什么用迁移脚本而不是改 init.sql

`docker/postgres/init.sql` 只在**空数据卷首次初始化**时执行，现有数据库不会再执行它。
所以新增 `bknd/migrations/0001_create_users.sql`，由 `npm run db:migrate` 明确执行：

- 按文件名顺序执行，每个文件只执行一次（记录在 `schema_migrations`）。
- 每个文件在事务中执行，失败自动回滚。
- 已执行过的迁移文件不要再修改；以后改表结构请新增 `0002_xxx.sql`。

### 重复邮箱如何拦截

不采用“先查询、再插入”，而是直接插入并依赖数据库唯一约束 `users_email_key`。
这样两个请求同时注册同一邮箱时，数据库保证只有一个成功；另一个触发 PostgreSQL 错误码 `23505`，
`UsersService` 将其转换成 `ConflictException`（第三步接口会对应 HTTP 409）。

## 运行步骤

在项目根目录先启动数据库（Docker Desktop 需已打开）：

```bash
docker compose up -d --wait
```

在 `bknd/.env` 中增加 `DATABASE_URL`（参考 `bknd/.env.example`，密码就是根目录 `.env` 的 `POSTGRES_PASSWORD`，特殊字符需 URL 编码），然后在 `bknd` 目录执行：

```bash
npm install          # 新增依赖 pg、argon2、@types/pg
npm run db:migrate   # 创建 users 表；重复执行是安全的
npm run db:migrate -- --status   # 只查看迁移状态
npm run test:e2e     # 包含真实数据库的用户表测试
```

在 DataGrip 或 psql 中查看：

```bash
docker compose exec postgres psql -U app -d agent_dev -c "\d users"
docker compose exec postgres psql -U app -d agent_dev -c "SELECT id, email, left(password_hash, 30), created_at FROM users;"
```

注意：后端现在启动时会连接数据库；数据库没启动或 `DATABASE_URL` 错误时，`npm run start:dev` 会直接报错退出。

## 文件阅读顺序

1. 本文。
2. `bknd/migrations/0001_create_users.sql`：表结构、唯一约束、CHECK 约束、updated_at 触发器。
3. `bknd/scripts/migrate.mjs`：迁移执行器。
4. `bknd/src/database/database.module.ts`：读取 `DATABASE_URL` 创建连接池，启动检查、关闭释放。
5. `bknd/src/users/user.types.ts`：`PublicUser`（可返回前端）与 `UserCredentials`（仅登录内部使用）的区别。
6. `bknd/src/users/password-hasher.service.ts`：Argon2id 哈希与校验。
7. `bknd/src/users/users.service.ts`：参数化 SQL、重复邮箱转换为 409。
8. `bknd/src/users/users.module.ts`、`bknd/src/app.module.ts`：模块注册。
9. `bknd/test/users.e2e-spec.ts`：验收测试。

## 本步骤验收

- [x] `npm run db:migrate` 创建 `users` 表，重复执行不会报错或重复建表。
- [x] 后端通过 `UsersService` 写入和查询测试用户。
- [x] 相同邮箱、仅大小写不同的邮箱、并发相同邮箱，都只能插入一次。
- [x] 数据库中 `password_hash` 为 Argon2id 哈希，不含明文；直接插入明文会被数据库拒绝。
- [x] `PublicUser` 不包含密码哈希。
- [x] `npm run lint`、`npm run build`、`npm test`、`npm run test:e2e` 通过。

## 下一步

第三步：新增 `AuthModule`，实现 `POST /auth/signup`、`POST /auth/login`，把 `GET /auth/me` 改为查询真实用户；
统一密码长度规则、输入校验 DTO、错误提示文案，并更新 Swagger 与 Postman。
