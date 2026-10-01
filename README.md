# Agent Development Project

个人 Agent 全栈开发学习项目，目前处于开发环境准备阶段。

## 计划使用的技术栈

- 前端：Next.js、TypeScript、Material UI v6
- 后端：NestJS REST API、Swagger、JWT
- Agent：Python、LangGraph，通过厂商 API 调用模型
- 数据库：PostgreSQL + pgvector
- 缓存：Redis
- 本地工具：VS Code、Docker、Postman

## 当前状态

已创建 Git 仓库；尚未初始化应用代码、安装项目依赖或配置模型 API。

## 后续目录规划

- `ftnd/`：前端
- `bknd/`：后端
- `agent/`：Python Agent
- `compose.yaml`：本地 PostgreSQL、pgvector、Redis

## 开发约定

- MUI 使用 v6；其他框架初始化后通过锁文件记录版本。
- 提交 `package-lock.json` 和 `uv.lock`。
- 真实密钥和密码放入本地 `.env`，示例配置只包含占位值。
- 本公开仓库用于个人通用学习代码，不包含实习内部资料。

## Git 日常操作

修改文件后，先检查差异，再提交和推送：

```bash
git status
git diff
git add README.md
git commit -m "docs: update project notes"
git push
```

将 `README.md` 换成实际准备提交的文件。GitHub 不会自动上传本地未提交的改动。
