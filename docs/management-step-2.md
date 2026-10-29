# 第二步：数据库增量迁移

新增 bknd/migrations/0002_management_tables.sql，没有改0001。
users增加name/role/status/is_admin；companies保存公司资料；relationships用外键保证公司存在。
数据库约束在API之外再做一道保护：员工数不能为负、岗位/状态仅接受约定值，公司编码唯一。
旧账号默认Member/active/非管理员，姓名为空；邮箱和密码哈希不变。

## 运行
在项目根目录先启动 docker compose up -d --wait，再进入bknd：
```bash
npm run db:migrate -- --status
npm run db:migrate
npm run db:migrate -- --status
```
迁移工具在事务中执行每个文件，失败会回滚该文件；schema_migrations防止重复执行。
本步迁移前导出了本地数据库备份到项目的data/backups（Git忽略），不要公开这个备份，它含账号哈希。
不要用down -v或DROP TABLE来解决迁移问题。

## 核对
在项目根目录：
```bash
docker compose exec postgres psql -U app -d agent_dev -c '\d users'
docker compose exec postgres psql -U app -d agent_dev -c '\d companies'
docker compose exec postgres psql -U app -d agent_dev -c '\d relationships'
```
学习主键（唯一标识）、外键（引用存在的行）、CHECK（有效值）、索引（查询辅助）、事务（失败不留半成品）。
此迁移不包含生产回退脚本；需要恢复时先确认备份目标，不能在有新业务数据时盲目删新增列。
