# 第六步 · 写工具开发规范

写工具使用独立的 `BaseWriteTool<业务DTO>`。本步交付后端注册与准备流程，示例“修改公司等级”只在验收应用中注册。用户和公司模块的七个业务工具在各自开发步骤接入。

## 如何注册与调用

1. 在写工具目录中定义单例 provider，添加 `@WriteTool({ name, target, operation })`，将类加入所属 Nest 模块的 providers。名称在读写工具之间全局唯一。装饰器固化 `kind: 'write'` 和 `autoExecute: false`。模型候选清单只包含现有读工具。
2. 设置 `inputDto` 并实现下表四个方法。注册时核对执行、回滚是否绑定到本周统一的关闭实现，自定义执行函数会导致启动失败。
3. 后端调用 `registry.prepareWrite(name, 'validate' 或 'preview', request.toolContext, args)`。上下文来自 JWT 守卫。拦截层核对已签发的身份与数据库中的当前管理权限，按业务 DTO 转换并校验参数，再调用业务规则校验。预览每次重新校验。校验失败沿用业务异常并结束流程。

| 方法 | 写工具作者的实现 |
| --- | --- |
| validate(context, dto) | 注入原业务 Service，调用只读查询或无副作用的业务校验方法。涉及重名、受保护账号、目标状态等规则时，应与业务入口复用。数据库写操作、消息发送等副作用禁止放在校验和预览中。 |
| getPreview(context, dto) | 返回可展示的变更字段名。框架用固定清单投影，再补上注册时声明的操作和目标类型。例如公司等级修改返回 company、update、[level]。 |
| execute(context, dto) | 绑定 executionClosed，固定返回 WRITE_EXECUTION_DISABLED。 |
| rollback(context, executionId) | 绑定 rollbackUnsupported，固定返回 ROLLBACK_UNSUPPORTED。 |

预览可以包含目标类型、操作和允许展示的字段名。密码、令牌、联系方式、财务数值、原始 DTO 和旧值或新值均排除。审计沿用脱敏参数快照与结果摘要。准备阶段使用如 `company.update.preview` 的动作名；读执行器收到写工具名时，记录 `tool.execute` 与 TOOL_UNAVAILABLE。预校验成功代表本次检查通过，不能作为以后执行时的授权凭据。

## 验收与复跑

测试应用注册一个公司等级修改骨架。通过管理员聊天模拟模型返回写工具名，并令普通开关始终启用。另测直接调用、合法预览、非法参数、目标不存在、伪造身份和撤权。检查业务更新方法调用次数，以及数据库中公司的最终等级。在仓库根目录运行：

```sh
bash bknd/scripts/verify-ai-foundation.sh
```

[基类与准备流程](../bknd/src/ai/tools/write/base-write-tool.ts) · [注册中心](../bknd/src/ai/tools/tool-registry.service.ts) · [可运行的示例与 HTTP 验收](../bknd/test/read-tool-api.e2e-spec.ts)

## 第七步 · 共用业务预校验

后端通过 `registry.prepareWrite(name, phase, request.toolContext, body, target)` 调度。工具可用 `targetParam` 声明用户 ID 或公司编码。用户 ID 复用原接口的 ParseUUIDPipe，公司编码按原接口作为字符串处理。单删使用 NoWriteBody，批量删除沿用 DeleteUsersDto 的 ids 数组。执行人始终取自 JWT 签发的上下文。

统一服务先复核当前管理员权限，再校验路径、用业务 dtoPipe 转换请求体，并调用工具绑定的业务校验。用户和公司 Service 均提供 validateCreate、validateUpdate、validateRemove；用户批删与单删共用 validateRemove。邮箱占用、管理员保护、目标存在性、用户引用及公司上下游关系检查由业务模块维护。校验抛出的 Nest 异常原样向上传递。创建用户的重复邮箱文案沿用英文，更新用户的重复邮箱文案沿用中文。

预校验只读数据库。真正删除时在原事务内锁定目标，再复核规则；并发创建或更新仍由唯一约束兜底。预校验成功仅说明检查当时允许继续预览。

配对测试通过测试专用 HTTP 入口调用同一个注册中心，对照实际管理接口的状态码和完整响应体；每组回读测试用户、公司及关系数据。可使用上方的隔离验收命令复跑。[统一预校验服务](../bknd/src/ai/tools/write/write-prevalidation.service.ts) · [HTTP 对照用例](../bknd/test/write-prevalidation.e2e-spec.ts)

## 第八步 · 已注册的用户写工具

四个工具已加入生产 `AiToolsModule`。受信任的后端调用方可通过 `prepareWrite` 进行预校验或预览。聊天模型可选工具列表与只读执行器继续只调度读工具。

| 工具 | 目标与参数 | 业务检查 |
| --- | --- | --- |
| userCreateTool | CreateUserDto 请求体 | 校验邮箱、密码、姓名、岗位和状态，再检查邮箱是否占用。预览只展示姓名、岗位和状态这三个字段名。 |
| userUpdateTool | 独立的目标 UUID、UpdateUserDto 请求体 | 检查目标存在、可修改字段、管理员保护和邮箱占用。预览只列本次提交且允许展示的字段名。 |
| userDeleteTool | 独立的目标 UUID | 检查目标存在、管理员保护及关联记录。 |
| userBatchDeleteTool | DeleteUsersDto 的 ids 数组 | 1 至 100 个不重复的 UUID 一次交给业务 Service。任一目标缺失、受保护或仍被引用，整批校验结束。 |

例如管理员预览修改某个用户的岗位，后端调用 `registry.prepareWrite('userUpdateTool', 'preview', request.toolContext, { role: 'Analyst' }, targetUserId)`。校验成功后得到 `{ operation: 'update', target: 'user', changedFields: ['role'] }`，用户表中的岗位保持原值。

密码原值仅用于创建 DTO 校验。生成写工具的审计副本时跳过 password 字段，覆盖预览成功、校验失败及模型误提写工具被拒绝的路径。两个删除工具在本周骨架中仅检查目标，执行仍返回 WRITE_EXECUTION_DISABLED。[用户工具实现](../bknd/src/ai/tools/write/user-write-tools.ts) · [密码审计回读](../bknd/scripts/verify-ai-tool-audits.mjs)
