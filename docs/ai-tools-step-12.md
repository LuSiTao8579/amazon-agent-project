# AI Agent 第二周交付与验收

登录工作台后，可在聊天框查询公司或查看 Dashboard。已启用的管理员还可查询用户。现场演示建议准备两个独立浏览器会话，分别登录测试管理员 A 和普通用户 B，再用同一身份的业务接口核对结果。聊天中的历史结果是发送时的快照，做数值对照时请使用同一批测试数据。

## 本次采用的业务口径

| 项目 | 实现与验收依据 |
| --- | --- |
| 用户岗位与管理权限 | 岗位字段为 `role`，取 `Member / Manager / Analyst`。读取用户列表要求当前账号有效且 `isAdmin=true`。岗位为 Manager 的普通用户也会收到权限提示。 |
| 公司金额与效率 | 详情显示年营收 `annualRevenue`，人均年营收为年营收除以员工数，沿用原始数据单位。员工为零时返回 `null`，显示“不可计算”。按原始人均值着色，低于 100 为浅橙，100 至不足 500 为浅蓝，500 及以上为浅绿。 |
| Dashboard 时间与收入 | `foundedYearFrom / foundedYearTo` 按成立年份筛选，含首尾。总收入是入选公司的年营收之和。国家去除首尾空格并忽略大小写去重。等级百分比的分母是入选公司数，累计曲线在首末成立年间补齐缺失年份。 |

以上是可从源码和样例核对的实现口径。第一步列给 Leader 的两项产品决定仍待签认，即需求里的“盈利额／盈利效率”是否接受营收口径，以及“时间范围”是否采用成立年份。演示时使用上表字段名。如需净利润或某经营期间的收入，需要业务方提供相应数据来源、期间定义及公式。[第一步核对记录](ai-tools-step-1.md) · [公司查询](../bknd/src/companies/companies.service.ts) · [Dashboard 统计](../bknd/src/dashboard/dashboard.service.ts)

## 三个工具的输入和输出

下列 JSON 只含业务参数。后端从 JWT 认证请求取得执行人和 IP。两个列表都支持 `page`（1 至 1000000，默认 1）、`pageSize`（1 至 100，默认 10）、`sortBy` 和 `sortOrder`（asc 或 desc）。多个岗位或等级满足任一项即可，其他筛选条件取交集。[输入规范与排序白名单](ai-tools-step-3.md)

| 工具与业务对照接口 | 可直接传给工具的示例参数（合成样例） | 从结果读取什么 |
| --- | --- | --- |
| `query_users` · `GET /users` | `{"search":"示例","roles":["Analyst","Manager"],"status":"active","sortBy":"name","sortOrder":"asc","page":1,"pageSize":10}` | `table`，`data.tableType="users"`。每行仅含 `name/email/role/status`。默认创建时间降序，同值按 ID 升序。 |
| `query_companies` · `GET /companies` | `{"search":"示例","country":"UK","city":"London","levels":[2,3],"sortBy":"companyName","sortOrder":"asc","page":1,"pageSize":10}` | `table`，`data.tableType="companies"`。每行含公司编码、名称、等级、国家、人均年营收和四个详情字段。默认公司编码升序。 |
| `dashboard_metrics` · `GET /dashboard` | `{"foundedYearFrom":2018,"foundedYearTo":2020,"country":"UK","levels":[2,3],"view":"report"}` | `report` 包含 `summary`、`levelDistribution`、`yearlyGrowth`。只需指标卡传 `"charts":[]`；需要单图时传 `"view":"levelDistribution"` 或 `"view":"yearlyGrowth"`，返回 `chartType/rows`。 |

两种表均可用 `data.total` 查匹配总数，用 `data.items.length` 查本页条数。报表的 `data.summary` 保留公司数、总收入、国家数、员工数的原始数值，卡片负责 K/M/B 格式。业务 HTTP 对照时，将多选参数写成逗号分隔值，例如 `levels=2,3`。Dashboard 的 `view` 和 `charts` 仅用于聊天展示。

在仓库根目录运行以下命令，可打印三种完整 JSON 返回样例，以及单图和失败结果。样例中一家公司有 4 名员工、年营收 1200，可以逐项核算人均年营收 300、等级占比 100%、累计 1 家。[固定样例](../contracts/tool-result.examples.ts) · [结果类型](../contracts/tool-result.d.ts)

```sh
node --input-type=module -e "import {examples} from './contracts/tool-result.examples.ts'; for (const key of ['users','companies','report','chart','forbidden']) console.log(key, JSON.stringify(examples[key], null, 2))"
```

## 用两个账号向 Leader 演示

请选用测试环境已有的姓名、城市、等级和年份。想演示翻页时，准备至少两名符合条件的用户。想演示空值时，准备一家员工数为零的公司。启动方式、JWT 与模型配置可查阅项目环境说明。[后端环境](backend-environment.md) · [聊天接入](ai-tools-step-7.md)

| 操作 | 核对点 |
| --- | --- |
| A 发送“查姓名含示例、岗位是 Analyst 或 Manager、状态启用的用户，按姓名升序，每页 1 条，取第 2 页” | 用同条件的 `GET /users` 对照排序、总数及当前页四个字段。 |
| B 发送“查用户，按姓名升序” | 聊天应显示“你没有权限执行此查询。”。在 Swagger 用 B 的令牌调用 `GET /ai/audits?result=failure`，找到 `toolName=query_users`、`resultSummary.code=FORBIDDEN`。由自动化测试的调用计数验证用户列表 Service 未执行。 |
| B 发送“查英国伦敦等级 2 或 3 的公司，按公司名升序，取前 10 家” | 在聊天表格展开同一家公司的详情，与公司页对照年营收、员工、色阶和零员工的空值。列表与 `GET /companies?country=UK&city=London&levels=2,3&sortBy=companyName&sortOrder=asc&page=1&pageSize=10` 对照。 |
| B 发送“查看 2018 至 2020 年成立、英国、等级 2 或 3 的公司综合指标、等级占比和累计趋势” | 与 `GET /dashboard?foundedYearFrom=2018&foundedYearTo=2020&country=UK&levels=2,3` 对照四张卡和两组图。若命中公司，各等级数量之和、累计曲线末点、公司数相等。 |
| 使用下节开关关闭公司工具，B 再发一条明确的公司查询，接着查 Dashboard，然后恢复开关并重查公司 | 对应请求依次显示公司工具不可用、Dashboard 正常、公司工具恢复。每次发新消息会产生新的请求编号。 |
| 切换到另一会话，再切回并刷新页面；用 B 查看自己的会话列表 | 原会话可恢复表格和图表，两会话内容独立。已有回合使用相同会话、`requestId` 和文本重试，仍返回原助手消息。B 查看 A 的会话消息应得到 404。 |
| A 在 Swagger 调用 `GET /ai/admin/audits`，按 B 的 `userId`、时间范围检查工具记录 | 核对用户、工具、操作、时间、IP、执行状态。成功表格含 `returnedCount/total`，失败含结果码。自由文本和敏感字段脱敏，结果摘要省略明细行。经前端代理时 IP 为后端连接对端。 |

认证、参数和业务故障可以按所在层区分。工具成功取得业务结果时返回 `OK`；工具参数含身份覆盖字段时按权限或 DTO 校验拒绝，未获签发的上下文在注册中心得到 `UNAUTHENTICATED`。工具内部业务异常返回 `EXECUTION_FAILED` 和“查询未完成，请稍后重试。”。HTTP 请求在入口因 JWT 或请求体不合法被拒绝时，尚未进入工具审计。[错误映射](../bknd/src/ai/tools/tool-result.ts) · [审计说明](ai-tools-step-5.md)

## 操作动态开关

先在测试环境读取当前值并记下。下列命令针对项目 Compose 的 Redis 逻辑库 0；自定义 `REDIS_URL` 时应连接后端实际使用的同一逻辑库。三项业务工具默认启用，运行中修改后下一次执行重新读取。

```sh
docker compose exec -T redis redis-cli HGET ai:tools:enabled query_companies
docker compose exec -T redis redis-cli HSET ai:tools:enabled query_companies 0
# 此时发送新的公司查询，并查询 Dashboard。
docker compose exec -T redis redis-cli HSET ai:tools:enabled query_companies 1
# 再发一条公司查询，确认恢复。
```

演示结束后，若初始记录不存在，执行 `docker compose exec -T redis redis-cli HDEL ai:tools:enabled query_companies` 恢复声明的默认值。若初始值为 0 或 1，用 HSET 写回该值。[注册中心与开关](ai-tools-step-4.md)

## 接入第四个只读工具

1. 以已有的 `example_count_users` 为样板。先确定所需业务权限、所属意图和输出字段，从原模块导出业务 Service。工具只注入该 Service，查询、数据范围和统计留在业务模块。[开发规范](ai-tools-step-2.md) · [最小工具示例](../bknd/src/ai/tools/example-count-users.tool.ts)
2. 继承 `BaseTool`，用 `@Tool` 声明唯一名称、说明、意图、权限和可选默认开关。指定业务 `inputDto`，实现 `run(context, args)`，返回 `{ resultType, data }`。把工具作为单例加入 Nest 模块的 `providers`。统一入口负责当前权限复核、DTO 校验、错误封装和审计。新权限需同步声明并实现业务权限映射。[现有工具](../bknd/src/ai/tools/business-tools.ts) · [模块](../bknd/src/ai/tools/ai-tools.module.ts) · [权限策略](../bknd/src/ai/tools/tool-policy.service.ts)
3. 让聊天可以选中它。在模型工具定义中增加描述和业务参数 JSON Schema，检查 `candidateTools` 对目标问法的候选范围。教学工具默认关闭，当前聊天白名单只包含三个业务工具。使用注册中心的 `listByIntent` 和 `execute` 验证后，再用真实聊天请求验证模型提案与历史回复。涉及受限数据时，同时覆盖权限变化后的历史和重试展示。[模型工具定义](../bknd/src/ai-agent/providers/chat-tools.ts) · [回合服务](../bknd/src/ai-agent/chat-turn.service.ts) · [历史权限](../bknd/src/ai-agent/turn-reply.ts)
4. 使用已有文本输出时可直接复用文本渲染。若引入新的表格或图表子类型，应同时更新共享契约、历史标准化、消息渲染和固定样例。对照业务 API 验证内容与范围，覆盖无权限、禁用、非法参数、零结果、业务异常及审计脱敏。[共享协议](../contracts/tool-result.d.ts) · [历史标准化](../ftnd/src/features/ai-chat/normalize-message.ts) · [消息渲染](../ftnd/src/features/ai-chat/components/message-renderer.tsx)

## 如何复跑回归

准备 Node.js 24、Docker 和项目依赖。从仓库根目录运行以下命令。后端隔离验收会自行创建并清理 PostgreSQL、Redis，覆盖迁移、构建、单元和 E2E 测试。浏览器验收启动构建后的 Next.js 和 Nest，使用本地固定 HTTP 模型提案，复跑时无需线上模型密钥。

```sh
npm --prefix bknd ci
npm --prefix ftnd ci
(cd bknd && npx playwright-core install chromium)
(cd bknd && bash scripts/verify-ai-foundation.sh)
npm --prefix ftnd run build
npm --prefix ftnd run typecheck
npm --prefix ftnd test
bash bknd/scripts/verify-ai-tools-browser.sh
```

现场演示可以从仓库根目录运行 `HEADED=1 bash bknd/scripts/verify-ai-tools-browser.sh`，观察两个浏览器身份在同一套测试数据上收发消息。默认运行使用无界面 Chromium。

后端脚本在临时测试数据上执行 `npm run build`、`npm test` 和 `npm run test:e2e -- --no-file-parallelism`。迁移过程先建立旧版本数据，再升级检查旧字段与新审计字段，随后验证全新数据库迁移和重复执行的结果。[后端验收脚本](../bknd/scripts/verify-ai-foundation.sh)

## 本次回归记录

2026-11-22 在本地隔离环境完成回归。后端构建、Lint、类型检查、51 项单测和 128 项 E2E 通过。前端生产构建、Lint、类型检查和 36 项测试通过。Chromium 无界面和可视模式分别跑通全部 6 组浏览器验收。浏览器使用两个独立登录会话，经 Next.js 聊天代理访问 Nest；数据由真实 PostgreSQL 和 Redis 提供。模型服务固定返回预期工具与参数，业务异常由测试注入一次。线上厂商的自然语言选参效果需用相应模型另行评估。

| 验收场景 | 实测结果 |
| --- | --- |
| 管理员查询用户 | 姓名含 Lin、岗位 Analyst 或 Manager、停用、姓名升序，匹配 4 人。每页 2 人，第 2 页为 Lin C、Lin D，字段和顺序与用户 API 一致。 |
| 权限和身份覆盖 | 普通用户得到 `FORBIDDEN`，用户列表调用增量为 0；有权账号的工具参数夹带身份字段，在调用列表前得到 `INVALID_ARGUMENTS`。审计能查到对应拒绝。 |
| 公司详情 | UK、London、等级 2 或 3 匹配 3 家。Alpha 和 Beta 的人均年营收分别为 100、500，显示浅蓝和浅绿；Cedar 展开后显示员工 0、年营收 42，人均值显示“不可计算”。 |
| Dashboard | UK、等级 2 或 3、成立于 2018–2020 年，共 4 家，年营收合计 792、覆盖 1 国、员工 5 人。两个等级各占 50%，逐年累计为 1、1、4，与同条件 Dashboard API 一致。 |
| 动态开关 | 禁用公司工具后下一次请求返回 `TOOL_UNAVAILABLE`，列表调用增量为 0；同期 Dashboard 查询成功。启用后公司查询立即恢复。 |
| 历史、隔离和重试 | 刷新、切换会话后恢复同一份结构化消息。普通账号访问管理员会话得到 404。重发已完成回合的原始请求，模型调用、业务查询和审计记录的增量均为 0。 |
| 异常与审计 | 每页 101 条触发分页提示；业务异常显示“查询未完成，请稍后重试。”。从审计接口读回脱敏参数与结果码。模拟模型返回 HTTP 503 时，页面只显示服务暂不可用，工具审计数量保持不变。 |
| 迁移兼容 | 在 0007 写入审计再升级到 0008，原账号经 HTTP 列表与详情读回原记录，新增的工具名、入参、结果摘要和 IP 均为 null。新审计写入后可回读，重复执行迁移通过。 |

每次复跑以脚本的退出状态判断是否通过。浏览器断言覆盖模型候选、实际业务调用计数、业务 API 对照、可见 DOM 和审计；后端回归另有撤权、伪造上下文、嵌套字段脱敏和迁移检查。[浏览器断言](../bknd/scripts/verify-ai-tools-browser.mjs) · [用户权限和异常测试](../bknd/test/read-tool-api.e2e-spec.ts) · [嵌套脱敏与审计](../bknd/test/tool-registry.e2e-spec.ts)
