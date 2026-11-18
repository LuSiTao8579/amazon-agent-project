# AI Agent 第二周第一步 · 业务工具接入核对

核对基于仓库版本 `0b662d1` 的源码和迁移。下表中的工具名为后续开发建议。业务查询已有三个可复用的 Service，聊天接入还需要补执行前鉴权、结构化回复和自动审计。

## 三个只读工具的现状与差异

| 拟接工具与意图 | 业务入口与现有读取权限 | 已有查询和字段 | 本周缺口与修改位置 |
| --- | --- | --- | --- |
| `query_users` · `QUERY_DATA` | `GET /users` → `UserManagementService.list(query)`。有效登录且为管理员 | 姓名关键词、岗位多选、分页。页面使用 `name / email / role / status`。默认按创建时间倒序，再按 ID 排序 | 业务 DTO 和 Service 补状态筛选、白名单排序。工具入口检查管理员权限，结果投影为页面四列 |
| `query_companies` · `QUERY_DATA` | `GET /companies` → `CompaniesService.list(query)`。有效登录用户可读 | 公司名关键词、等级多选、分页，默认按公司编码排序。主行使用 `companyName / level / country / revenuePerEmployee`，详情使用 `city / foundedYear / annualRevenue / employees` | 业务 DTO 和 Service 补国家、城市、白名单排序。记录与总数使用同一筛选条件。展示层用 `companyCode` 标识折叠行，复用现有色阶 |
| `dashboard_metrics` · `STATISTICS_ANALYSIS` | `GET /dashboard` → `DashboardService.getDashboard()`。有效登录用户可读 | `summary` 返回公司数、总收入、覆盖国家数和员工数；`levelDistribution` 返回各等级数量及百分比；`yearlyGrowth` 返回每年新增及累计公司数 | 业务 Service 在三个统计共用的公司数据集上增加时间、国家、等级筛选。工具传递原始数值，展示层复用卡片、图表及 K/M/B 格式 |

两个列表共用 `page / pageSize`，默认第 1 页、每页 10 条、上限 100 条，返回 `items / total / page / pageSize`。三个业务模块目前都在模块内部声明相应 Service。接入时由各模块导出 Service，工具只注入业务 Service；筛选、排序、分页和统计计算留在业务层。[公共分页 DTO](../bknd/src/common/list.dto.ts) · [用户模块](../bknd/src/users/user-management.module.ts) · [公司模块](../bknd/src/companies/companies.module.ts) · [Dashboard 模块](../bknd/src/dashboard/dashboard.module.ts)

## 怎样沿代码验证

1. **先看 Controller，确定谁能查。** 用户列表入口依次执行 JWT 和管理员检查。JWT 守卫验证凭证后按用户 ID 重新查库，要求账号为 `active`；管理员守卫读取这次请求中的 `isAdmin`。公司和 Dashboard 的读取入口只要求有效登录。[用户入口](../bknd/src/users/user-management.controller.ts) · [JWT 守卫](../bknd/src/jwt-auth.guard.ts) · [管理员守卫](../bknd/src/admin.guard.ts) · [公司入口](../bknd/src/companies/companies.controller.ts) · [Dashboard 入口](../bknd/src/dashboard/dashboard.controller.ts)
2. **再看列表 DTO 和 Service，确定能查什么。** 例如“查已启用的 Analyst”：现有 `roles` 可接收 `Analyst`，多选支持 `Member / Manager / Analyst`；列表 DTO 和查询条件都缺 `status`。需求中的 title/role 可映射到岗位字段 `role`。一个 `role=Manager`、`isAdmin=false` 的账号也应被拒绝。工具直接调用 `list(query)` 时不会经过 Controller Guard，必须在执行前使用后端认证上下文检查同一权限。[用户 DTO](../bknd/src/users/user-management.dto.ts) · [用户列表实现](../bknd/src/users/user-management.service.ts)
3. **最后对照取数与渲染位置。** 公司 Service 计算年营收除以员工数，员工为零返回 `null`。公司表按小于 100、100 至不足 500、500 及以上着色，空值显示“不可计算”。Dashboard 在同一查询快照中统计，国家去除首尾空格并忽略大小写去重，曲线补齐中间缺失年份。数字缩写由页面的 `compact()` 完成。[公司 DTO](../bknd/src/companies/company.dto.ts) · [公司查询](../bknd/src/companies/companies.service.ts) · [公司表色阶](../ftnd/src/components/management-table.tsx) · [Dashboard 统计](../bknd/src/dashboard/dashboard.service.ts) · [Dashboard 展示](../ftnd/src/components/dashboard.tsx)

## 聊天和审计的接入位置

| 环节 | 已有实现 | 后续修改 |
| --- | --- | --- |
| 聊天回合 | Agent 接口把已认证用户 ID 传入回合服务。服务按会话和 `requestId` 处理重复请求，调用模型得到文本 | 在同一回合中加入工具选择、可信身份上下文和统一执行入口，复用已有重复请求处理。[Controller](../bknd/src/ai-agent/ai-agent.controller.ts) · [回合服务](../bknd/src/ai-agent/chat-turn.service.ts) |
| 消息存储与恢复 | PostgreSQL 的 `ai_chat_messages` 已支持 text/table/chart/report 和 JSONB 内容。当前助手完成回合时固定写 text，最近对话恢复读取 `content.text` | 按工具结果类型保存内容，明确结构化回复如何生成对话摘要，供缓存失效后恢复。[消息迁移](../bknd/migrations/0003_ai_chat.sql) · [回合读写](../bknd/src/ai-agent/chat-turn.repository.ts) |
| 前端聊天 | 发送成功后重新加载历史。标准化函数对表格、图表、报表仅保留标题，渲染器显示占位提示 | 历史标准化保留经过校验的行、指标和序列，再分发到只读表格、卡片、图表或错误提示组件。[发送流程](../ftnd/src/features/ai-chat/components/chat-window.tsx) · [消息标准化](../ftnd/src/features/ai-chat/normalize-message.ts) · [渲染器](../ftnd/src/features/ai-chat/components/message-renderer.tsx) |
| 审计 | `AiAuditService.create()` 写入只追加的 `ai_operation_audit`。已有用户、操作、资源类型及 ID、成功或失败标记、时间 | 通过增量迁移和 Entity 补齐工具名、脱敏入参、结果摘要和可信请求 IP。在统一执行入口使用装饰器，覆盖成功、拒绝和异常。写入前脱敏金额和联系方式。[审计迁移](../bknd/migrations/0007_ai_foundation.sql) · [审计 Entity](../bknd/src/ai/entities/ai-operation-audit.entity.ts) · [审计 Service](../bknd/src/ai/services/ai-audit.service.ts) |

## 待 Leader 确认的两个口径

| 需要回答的问题 | 基于现有数据的建议 | 对验收的影响 |
| --- | --- | --- |
| 公司“年盈利额、盈利效率”能否沿用页面的“年营收、人均年营收”？ | 沿用 `annualRevenue` 和 `revenuePerEmployee`、原始单位及现有色阶 | 若确需利润，请明确利润字段来源和效率公式，再确定返回值及色阶 |
| Dashboard 的时间范围指公司成立年份，还是收入所属经营期间？ | 按 `foundedYear` 区间筛选公司，四张卡及两组图均取这个范围内的公司 | 例如“2020 年成立公司的年营收合计”可用现有数据定义。“2020 年所有公司的实际收入”需要按经营期间记录的收入数据 |

两项均待业务确认。基础工具契约、权限映射和注册中心设计可以先行。
