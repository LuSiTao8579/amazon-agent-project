# Postman 接口调试与第六步 API 验收

## 集合与环境文件

- `postman/auth-api.postman_collection.json`：完整认证 API 验收集合（共 8 个请求，覆盖正反向场景与自动断言）。
- `postman/local-api.postman_collection.json`：基础环境验证集合（6 个请求，其中 `05` 验证真实用户，`06` 验证 Swagger OpenAPI 文档包含完整认证接口且不暴露密码哈希）。
- `postman/local.postman_environment.json`：本地环境变量（`baseUrl = http://127.0.0.1:3001`，`token` 默认为空占位符）。
- `postman/collections/Amazon Agent — Local API/`：Postman 原生目录请求与断言（已与 JSON 集合保持同步）。

## 认证集合 8 个请求及预期结果

导入 `postman/auth-api.postman_collection.json` 与 `postman/local.postman_environment.json`，右上角选择 **Amazon Agent — Local** 环境，按顺序运行：

| 序号与名称 | 方法与路径 | 验证目标 | 预期状态码与断言 |
| --- | --- | --- | --- |
| `01 — 注册：非法输入被拦截（400）` | `POST /auth/signup` | 错误邮箱格式、过短密码被后端拦截 | `400`，`message` 为错误数组，不含敏感字段 |
| `02 — 注册：合法新邮箱（首次 201 / 重复 409）` | `POST /auth/signup` | 合法新邮箱写入 PostgreSQL | 首次 `201`（返回 `message` 与公开 `user`，不含 `accessToken`/`password`/`passwordHash`）；重复运行则 `409` |
| `03 — 注册：重复邮箱被拒绝（409）` | `POST /auth/signup` | 大写/重复邮箱触发唯一约束冲突 | `409`，`message` 为 `"该邮箱已注册"` |
| `04 — 登录：不存在的邮箱被拒绝（401）` | `POST /auth/login` | 未注册邮箱不能登录，且不泄露邮箱是否存在 | `401`，`message` 为 `"邮箱或密码错误"` |
| `05 — 登录：错误密码被拒绝（401）` | `POST /auth/login` | 错误密码不能登录，提示与不存在邮箱一致 | `401`，`message` 为 `"邮箱或密码错误"` |
| `06 — 登录：正确密码签发 JWT（200）` | `POST /auth/login` | 正确密码登录并返回短期 Bearer JWT | `200`，含 `accessToken`、`expiresIn: 900`、公开 `user`；脚本自动执行 `pm.environment.set('token', data.accessToken)` |
| `07 — 当前用户：有效 JWT 返回真实用户（200）` | `GET /auth/me` | 携带 `{{token}}` 查询数据库真实用户 | `200`，返回 `id`、`email`、`createdAt`、`updatedAt`，不含密码或哈希 |
| `08 — 当前用户：无效或过期 JWT 被拒绝（401）` | `GET /auth/me` | 伪造或失效凭证被 `JwtAuthGuard` 拦截 | `401` |

> 说明：`06 — 登录` 的 Post-response 脚本会在 Postman 内存环境中自动写入 `token`，因此直接发送 `07 — 当前用户` 或使用 Collection Runner 一键按序运行即可全部通过，无需把真实 Token 写进 Git 跟踪的仓库文件。

## 安全与提交注意事项

- `bknd/scripts/dev-token.mjs` 已停用，所有受保护接口测试必须使用真实注册并登录获得的 JWT。
- 不要将真实密码、`JWT_SECRET` 或运行后生成的有效 `token` 导出并提交到 Git 跟踪的 JSON/YAML 文件中。
- 完整端到端验收清单见 [第六步说明](auth-step-6.md)。
