# 写工具开发规范与七项验收

本周生产模块注册了四个用户写工具和三个公司写工具。管理员可以通过后端注册中心校验或预览一次拟议变更。聊天调度继续只暴露读工具，七个写工具的真实执行和回滚均已关闭。

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

测试应用注册一个公司等级修改骨架。通过管理员聊天模拟模型返回写工具名，并令普通开关始终启用。另测直接调用、合法预览、非法参数、目标不存在、伪造身份和撤权。检查业务更新方法调用次数，以及数据库中公司的最终等级。在仓库根目录运行以下命令。

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

## 第九步 · 已注册的公司写工具

三个工具使用现有 `CompaniesService` 的只读校验方法，统一注册为 `kind: 'write'`、`autoExecute: false`。管理员可通过后端注册中心请求校验或预览，普通账号在查询目标公司前收到 403。

| 工具 | 对应的业务入口 | 校验规则 |
| --- | --- | --- |
| companyCreateTool | POST /companies | CreateCompanyDto 校验编码、名称、等级、国家、城市、成立年份、年营收和员工数，validateCreate 检查编码冲突。名称相同且编码不同的公司可以通过。 |
| companyUpdateTool | PATCH /companies/:code | 目标编码单独传入。UpdateCompanyDto 排除 companyCode，validateUpdate 检查有可更新字段并确认目标存在。 |
| companyDeleteTool | DELETE /companies/:code | validateRemove 确认目标存在，并检查 relationships 的 company_code 与 parent_company 两列。任意一列引用目标，均返回 409。 |

例如关系表中一行记录的 company_code 为 B，parent_company 为 A。预检删除 B 时命中当前公司编码，预检删除 A 时命中上级公司编码。两次检查都会保留 A、B 及这行关系。无关联公司的删除预览只返回目标类型、操作及空字段清单。

更新预览只列出本次提交且允许展示的字段名。只修改年营收时，可得到成功的预览和空的 changedFields，审计记录会遮盖金额。可在仓库根目录运行 `bash bknd/scripts/verify-ai-foundation.sh` 复跑。[公司工具实现](../bknd/src/ai/tools/write/company-write-tools.ts) · [业务规则](../bknd/src/companies/companies.service.ts) · [HTTP 对照用例](../bknd/test/write-prevalidation.e2e-spec.ts)


## 第十步 · 双账号验收矩阵

每一行使用相同的合法请求体和操作目标，分别由管理员及普通账号重新通过 JWT 守卫。预期管理员请求 `validate` 得到 `{ validated: true }`，随后请求 `preview` 得到工具声明的操作、资源类型及下表字段名。普通账号的这两个请求均应返回 HTTP 403，预览钩子调用次数为零。业务失败样本使用同一身份调用原管理接口，比对完整错误体及状态码。

| 正式工具 | 管理员合法输入 | 预期预览字段名 | 代表性失败样本与预期 |
| --- | --- | --- | --- |
| userCreateTool | 新邮箱、合规密码、姓名、岗位和状态 | role、status、name | 已占用邮箱 409，缺少必填项 400 |
| userUpdateTool | 普通用户 UUID、原邮箱和新状态 | status | 目标为管理员 403，邮箱冲突 409 |
| userDeleteTool | 无引用的普通用户 UUID | 空 | 目标受保护 403，有关联记录 409 |
| userBatchDeleteTool | 一个合法 UUID，另有 100 人上限样本 | 空 | 混入管理员 403，混入有引用用户 409，101 个 UUID 或重复项 400 |
| companyCreateTool | 不同编码、相同公司名，数值取 DTO 允许的上限 | level、city、country、companyName、employees、foundedYear | 编码已占用 409，非法编码 400 |
| companyUpdateTool | 单独传目标编码，提交等级、年份、员工数及营收的下界值 | level、employees、foundedYear | 试图修改编码或提交空补丁 400，目标不存在 404 |
| companyDeleteTool | 无关联的公司编码 | 空 | 目标作为关系表任一端均为 409，目标不存在 404 |

**执行拦截的预期。** 七个工具的元数据均应包含 `kind: 'write'` 和 `autoExecute: false`。在两种身份下，读工具清单均排除这些名称。显式调用读执行器返回 `TOOL_UNAVAILABLE`，直接调用写工具的 `execute` 和 `rollback` 分别返回 `WRITE_EXECUTION_DISABLED` 和 `ROLLBACK_UNSUPPORTED`。

**如何证明没有执行业务写入。** 测试在夹具建好后监听两个业务 Service 的 `create`、`update`、`remove`，共六个方法，调用时仍会运行原实现。每个工具在每种身份下走完准备与执行拦截后，逐一核对六个方法的调用次数，并对比用户、公司和供应链关系的数据库快照，包含更新时间。另有 40 组失败请求先调用原业务接口，再检查随后 AI 请求的业务写调用增量及完整错误体。[双账号验收与错误对照](../bknd/test/write-prevalidation.e2e-spec.ts)

**2026-11-28 实测。** 表中七行均通过。管理员完成 7 次校验和 7 次预览，预览字段逐项符合表中预期。普通账号的 14 次准备请求均收到 403。两种身份各对 7 个工具检查了只读调度、直接执行和回滚，全部返回预期拦截码。每种身份、每个工具的六个业务写方法调用增量均为 0，三类业务数据快照均相等。40 组失败请求的状态码、完整响应体与业务接口一致。隔离后端全量回归通过 56 项单元测试和 185 项端到端测试（17 个端到端测试文件）。

**复跑。** 在装有后端依赖并可运行 Docker 的环境中，从仓库根目录执行上方的 `bash bknd/scripts/verify-ai-foundation.sh`。脚本建立、清理隔离 PostgreSQL 与 Redis。双账号矩阵在新迁移库验证业务行为，升级库中的审计专项通过独立数据库连接和审计 API 回读真实记录。[隔离环境入口](../bknd/scripts/verify-ai-foundation.sh) · [审计回读](../bknd/scripts/verify-ai-tool-audits.mjs)

**后续工作。** 本周交付到预校验和预览。用户确认后的授权、真实提交与回滚留给后续开发。接入真实提交流程时仍需要在提交时复核身份、业务规则和数据库约束，以处理预览后权限或目标状态发生变化的情况。
