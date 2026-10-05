# 本地数据库环境

在项目根目录执行本文命令。先打开 Docker Desktop。

## 文件阅读顺序

1. `compose.yaml`：两个服务、镜像版本、端口、数据卷及健康检查。
2. `.env.example`：配置变量示例，可以提交 Git。
3. `.env`：本地 PostgreSQL 密码，不提交 Git。与 `agent/.env` 的模型配置独立。
4. `docker/postgres/init.sql`：首次初始化空数据库时启用 pgvector。

## 连接参数

| 项目 | PostgreSQL | Redis |
| --- | --- | --- |
| 本机地址 | 127.0.0.1 | 127.0.0.1 |
| 本机端口 | 15432 | 16379 |
| 用户名 | app | 无需填写 |
| 密码 | 根目录 .env 的 POSTGRES_PASSWORD | 本地开发未设置 |
| 数据库 | agent_dev | 0 |

DataGrip 可创建 PostgreSQL 数据源，填入上述参数并 Test Connection。
容器内部端口分别是 5432、6379；同一 Compose 网络中的服务使用 postgres:5432 和 redis:6379。
这份配置仅绑定本机回环地址，不应原样用于公网部署。

## 启动和检查

```bash
docker compose up -d --wait
docker compose ps
docker compose exec postgres psql -U app -d agent_dev -c "SELECT extversion FROM pg_extension WHERE extname = 'vector';"
docker compose exec redis redis-cli ping
```

pgvector 是 PostgreSQL 的向量存储与相似度检索扩展，之后可用于知识库检索。
Redis 开启 AOF 持久化。两个服务各自使用本项目命名的数据卷，与其他项目分开。

## 日常管理

```bash
docker compose stop
docker compose start
docker compose logs --tail=50 postgres redis
```

stop 暂停服务但保留数据。不要随意执行 `docker compose down -v`，它会删除本项目数据卷。
数据库初始化之后，仅改 .env 不会更改数据库已有密码。
init.sql 仅在空数据卷首次初始化时执行，不是每次启动都会执行。

## 后续工作

本步骤仅配置数据库服务；Next.js、NestJS 及应用数据库连接仍需后续配置。
