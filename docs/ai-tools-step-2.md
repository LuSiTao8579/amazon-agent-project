# AI Agent 第二周第二步 · 工具开发规范

工具调用有两个独立输入。`context` 说明谁在发起请求，`args` 说明要查询什么。可以用教学工具 `example_count_users` 跟踪一次“统计 Analyst 用户数”的调用。[完整示例](../bknd/src/ai/tools/example-count-users.tool.ts)

## 从认证请求执行

在使用 `JwtAuthGuard` 的 Nest 请求处理方法中，从 `@Req()` 取得 `ToolRequest`，将模型或客户端提出的业务参数单独传入。示例工具默认关闭，启用方式见[注册中心与开关](ai-tools-step-4.md)。

```ts
const result = await registry.execute('example_count_users', request.toolContext, { roles: ['Analyst'] });
```

1. 守卫验证 JWT 并查库确认账号有效，用当前用户 ID、当前管理员标记和 TCP 对端 IP 生成只读上下文。服务端按对象引用识别签发的上下文，调用方须在当前请求中直接传递原对象。经过前端代理时，该 IP 代表连接到后端的代理；客户端自行提供的转发头不能覆盖它。[JWT 守卫](../bknd/src/jwt-auth.guard.ts)
2. `execute` 首先验证上下文来源，缺失上下文或传入复制的普通对象会得到工具结果码 `UNAUTHENTICATED`。然后按当前账号权限和运行时开关鉴权。`users.read` 与用户管理页面共用管理员判定；`companies.read` 和 `dashboard.read` 允许有效登录用户。遇到未知权限时拒绝执行。[工具基类](../bknd/src/ai/tools/base-tool.ts) · [管理员判定](../bknd/src/admin.guard.ts)
3. 基类通过现有 AI DTO 管道校验并转换 `args`。本例仅接收 `UserListDto` 的姓名、岗位、排序和分页参数，默认第 1 页、每页 10 条。传入 `userId`、`isAdmin`、`context` 或 `ip` 会得到工具结果码 `INVALID_ARGUMENTS`。只有通过上述检查后才调用 `run(context, args)`。[DTO 管道](../bknd/src/ai/dto/ai-dto.pipe.ts) · [用户列表 DTO](../bknd/src/users/user-management.dto.ts)

## 添加一个只读工具

1. 找到原业务 Controller，核对读取权限；找到对应业务 Service 和查询 DTO，确认支持的参数及返回字段。
2. 创建 `@Tool(...)` 类并继承 `BaseTool<输入DTO, 返回类型>`。声明稳定且项目内唯一的 `name`、描述用途的 `description`、`intent`、业务操作 `permission` 和具体的 `inputDto` 类。意图使用 `QUERY_DATA` 或 `STATISTICS_ANALYSIS`。启动时注册中心自动发现工具并检查重名。
3. DTO 只声明允许的业务字段并添加校验。认证信息、IP 和权限标记禁止出现在业务 DTO 中。查询涉及资源归属时，将 `context.userId` 交给支持数据范围检查的业务 Service。
4. 构造器仅注入业务 Service，在受保护的 `run` 方法中调用其公开方法。保留基类的 `execute` 作为唯一执行入口，禁止覆盖它。工具禁止注入 Repository 或数据库连接池，禁止手写 SQL。缺少筛选条件时扩展原业务 DTO 和 Service，使记录和总数沿用同一查询条件。
5. 原模块通过 `exports` 导出业务 Service；工具模块按需导入其所属模块，并把工具类加入 `providers`。示例使用 `UserManagementModule` 已导出的 Service。公司和 Dashboard 模块也已导出各自的 Service，后续工具可按需导入。[工具模块](../bknd/src/ai/tools/ai-tools.module.ts)
6. 通过 `execute` 测试正常调用和拒绝路径。特别验证普通岗位不能取得管理员权限，身份覆盖字段和非法业务参数都在调用 Service 前被拒绝。

## 本地验证

在 `bknd/` 目录运行以下命令。

```sh
npm test -- src/ai/tools/base-tool.spec.ts
```

测试使用真实的 Nest 模块、JWT 签发与验证、HTTP 请求及 DTO 管道。账号读取和用户列表查询用测试替身验证，无需数据库。示例的 HTTP 入口仅存在于测试应用；本步骤交付的调用方式是后端模块注入。[验证用例](../bknd/src/ai/tools/base-tool.spec.ts)
