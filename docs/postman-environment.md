# Postman 接口调试

## 集合

- postman/local-api.postman_collection.json：原有 6 个环境验证请求，05 已改为读取真实用户。
- postman/auth-api.postman_collection.json：新增注册、登录、当前用户三个请求。
- postman/local.postman_environment.json：本地 baseUrl 和空 token 占位符。
- 原生目录 postman/collections 中旧 05 请求的响应断言也已同步。

## 使用顺序

1. 确保 Docker 中 PostgreSQL 正常，第二步迁移已完成。
2. 在 bknd 运行 npm run start:dev。
3. 在 Postman 导入上述 JSON，选中 Amazon Agent — Local 环境。
4. 打开认证集合“01 — 注册”，填写演示邮箱、密码并发送；首次返回 201，再次使用相同邮箱返回 409。
5. 打开“02 — 登录”，用同一邮箱密码发送，返回 200 与 accessToken。
6. 将 accessToken 复制到本地环境的 token 值，再发送“03 — 当前用户”，应得到真实用户信息。
7. 原环境集合 05 请求也使用这个 Token。03、04 返回 401 是预期通过。

注册密码规则为 15–128 字符，允许符号/空格但不能全为空白。
演示集合中的邮箱、密码是公开测试值，可换成自己的本地测试账号。
手动注册的账号会保留在本地数据库。

## 注意事项

scripts/dev-token.mjs 已停用，不能再用旧 local-dev-user Token 代替登录。
Token 15 分钟过期后重新登录；JWT_SECRET 不能粘贴到 Postman。
真实 Token 和密码不要保存到 Git 跟踪的 JSON/YAML，也不要导出到仓库。
如果已导入过旧 JSON，需要更新或重新导入，以使用新的 05 响应断言。

## 常见问题

- ECONNREFUSED：确认后端启动并监听 3001，数据库运行。
- 400：查看响应 message，检查格式、密码长度和是否传入多余字段。
- 401：检查邮箱密码，或是否使用登录返回的、尚未过期的 Token。
- 409：邮箱已注册，直接登录或换一个测试邮箱。
- 地址仍是 {{baseUrl}}：选择本地环境。
- 旧断言仍在检查 subject/local-dev-user：更新集合；当前 /auth/me 返回 id、email、createdAt、updatedAt。

测试脚本位于请求的 Scripts → Post-response。自动测试与完整接口契约见 [第三步说明](auth-step-3.md)。
