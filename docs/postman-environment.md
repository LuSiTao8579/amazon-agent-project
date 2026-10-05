# Postman 接口调试

## 文件

- `postman/local-api.postman_collection.json`：6 个请求及响应断言（测试脚本）。
- `postman/local.postman_environment.json`：本地地址变量和空的 Token 占位符。
- `bknd/scripts/dev-token.mjs`：本地生成有效期 15 分钟的测试 JWT。

## 导入 Postman

1. 打开 Postman 并自行完成登录。当前版本提示保存和管理 Collections 需要账号；轻量客户端仅用于发送请求，不能替代下面的集合导入流程。
2. 点击 Import，选择上述两个 JSON 文件。
3. 在环境下拉框选择 Amazon Agent — Local。
4. 启动后端：

```bash
cd /Users/lusitao/Desktop/amazon-agent-project/bknd
npm run start:dev
```

另开一个终端，在 bknd 目录执行：

```bash
node scripts/dev-token.mjs
```

将输出的 Token 填到 Postman 环境变量 token 的本地值中，不要发布或导出真实 Token 到 Git。
Token 过期后重新生成。本操作不需要也不应该把 JWT_SECRET 粘贴到 Postman。

## 执行

先打开 02 — 健康检查，点击 Send，应得到 200 和 status: ok。
然后执行所有请求，或在支持 Collection Runner 的模式中运行整个集合。
共 6 个请求、10 条断言。03 和 04 返回 401 是预期通过；05 应返回 200。
测试脚本位于各请求 Scripts → Post-response（旧版叫 Tests）。

## 常见问题

- ECONNREFUSED：先启动后端，确认端口 3001。
- 05 返回 401：检查环境是否选中、Token 是否已填写或过期。
- 地址仍显示 {{baseUrl}}：选择导入的环境。
- Postman 提示登录：可自行完成登录；本项目代码和后端运行不依赖 Postman 账号。

## 范围

已通过 Newman（Postman 集合命令行运行器）验证：6 个请求和 10 条断言全部通过；真实测试 Token 仅放在运行内存中，未写入导出的环境文件。
桌面应用已安装；集合导入留待用户完成账号登录后操作。
这些测试覆盖后端首页、健康检查、JWT 拒绝与通过、Swagger 文档。
不代表数据库和 Agent 已接入后端，业务联调仍是下一阶段工作。
