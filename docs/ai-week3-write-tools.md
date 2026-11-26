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
