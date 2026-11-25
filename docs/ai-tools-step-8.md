# AI Agent 第二周第八步 · 用户查询

管理员可以在聊天框输入“查姓名含林、岗位是 Manager 或 Analyst 的停用用户，按姓名升序，每页 2 人，取第 2 页”。模型可向 `query_users` 提出以下业务参数。后端从已认证的请求中取得执行人的身份。

```json
{
  "search": "林",
  "roles": ["Manager", "Analyst"],
  "status": "inactive",
  "sortBy": "name",
  "sortOrder": "asc",
  "page": 2,
  "pageSize": 2
}
```

## 怎样读结果

姓名按关键词做字面包含匹配；多个岗位选中任意一个即可，姓名、岗位和状态条件需要同时满足。可选岗位有 `Member`、`Manager` 和 `Analyst`。状态取 `active`（启用）或 `inactive`（停用），省略时两种状态都参与查询。排序复用管理模块的 `name`、`email`、`role`、`status`、`createdAt` 白名单，默认按创建时间降序，同值按用户 ID 升序。默认第 1 页、每页 10 条，最多每页 100 条。

聊天结果为 `table`，数据类型为 `users`。每行保留姓名、邮箱、岗位和状态。分页对象中 `total` 是全部匹配数，`items` 是当前页。可以使用同一管理员身份调用 `GET /users?search=林&roles=Manager,Analyst&status=inactive&sortBy=name&sortOrder=asc&page=2&pageSize=2`，按邮箱与聊天表格逐行对照。[查询实现](../bknd/src/users/user-management.service.ts) · [工具实现](../bknd/src/ai/tools/business-tools.ts)

## 谁能查

| 当前账号 | 聊天查询结果 |
| --- | --- |
| 已启用的管理员 | 返回匹配用户和分页信息 |
| 普通用户 | 返回权限提示，工具审计记录 `FORBIDDEN` |
| 岗位为 Manager 的非管理员 | 同样返回 `FORBIDDEN`，工具审计归属本人 |

`roles` 和 `status` 筛选的是结果里的用户。执行人的权限取决于登录身份和数据库中的管理员标志。注册中心先拦截无权限的工具请求，拒绝时用户列表方法的调用次数为零。业务列表方法也会独立校验签发的身份和当前权限，以覆盖绕开 HTTP 守卫直接调用 Service 的路径。管理员撤权后，重新读历史或重发原请求时，之前的用户表显示权限提示。

## 复验

在 `bknd/` 运行 `bash scripts/verify-ai-foundation.sh`（需要 Docker）。新增用例使用固定模型提案，在真实 PostgreSQL 和 Redis 上验证管理 API 和聊天结果逐页相同、响应字段白名单、三种账号的权限、拒绝审计、无效状态和撤权后的访问。[第八步端到端用例](../bknd/test/read-tool-api.e2e-spec.ts)
