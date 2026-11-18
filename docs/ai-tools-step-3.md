# AI Agent 第二周第三步 · 工具结果、参数与异常

调用方先读 `code`。成功时按 `resultType` 读取 `data`，失败时直接显示 `message`。工具的 `run` 返回 `{ resultType, data }`，基类的 `execute` 负责补齐成功结果，或把权限、校验和执行异常转换为失败结果。[共享契约](../contracts/tool-result.d.ts) · [工具入口](../bknd/src/ai/tools/base-tool.ts)

| 业务码 | 含义 | 调用方处理 |
| --- | --- | --- |
| `OK` | 调用成功 | 根据类型读取对象，包括零匹配的表格 |
| `INVALID_ARGUMENTS` | 参数格式、范围或白名单检查失败 | 显示可修正的提示，例如“每页条数须为 1 至 100 的整数。” |
| `UNAUTHENTICATED` | 工具上下文缺失或无效 | 提示重新登录 |
| `FORBIDDEN` | 已认证用户缺少业务权限 | 展示权限提示 |
| `TOOL_UNAVAILABLE` | 工具禁用或暂不可用 | 展示暂不可用提示。后续注册中心可直接返回 `toolFailure('TOOL_UNAVAILABLE')` |
| `EXECUTION_FAILED` | 业务查询发生其他异常 | 提示稍后重试，内部异常文本留在服务端边界内 |

失败结果统一使用 `data: null` 和 `resultType: 'text'`。工具业务码描述一次工具调用；请求在进入工具之前被 JWT 守卫拒绝时，现有接口仍返回 HTTP 401。

## 四种成功结果

| resultType | data 的内容 |
| --- | --- |
| `text` | `text` 提供展示文本 |
| `table` | `tableType` 为 `users` 或 `companies`，并返回 `items / total / page / pageSize`。公司行含展示字段和详情字段，以 `companyCode` 标识 |
| `chart` | `chartType` 为 `levelDistribution` 或 `yearlyGrowth`，`rows` 复用相应的 Dashboard 数据点 |
| `report` | Dashboard 原始 `summary / levelDistribution / yearlyGrowth`，用于组合展示 |

联调约定为消息的 `messageType = result.resultType`，`content = result`。现有聊天渲染入口对结构化样例显示结果摘要，空列表显示正常空状态，失败使用错误提示。非空列表若请求的页码超出最后一页，显示匹配总数和本页 0 条。在线工具选择、结构化回复落库和完整业务组件在后续步骤接入。

## 列表参数

两类列表均使用从 1 开始的 `page`（最大 1000000）和 `pageSize`（默认 10，范围 1–100）。`sortOrder` 可取 `asc` 或 `desc`。只传 `sortBy` 时默认升序；只传 `sortOrder` 时作用于原默认主排序字段。

| 列表 | sortBy 白名单 | 省略排序参数时 |
| --- | --- | --- |
| 用户 | name、email、role、status、createdAt | createdAt 降序，同值按 id 升序 |
| 公司 | companyCode、companyName、level、country、city、foundedYear、annualRevenue、employees、revenuePerEmployee | companyCode 升序 |

例如 `{ "sortBy": "level", "sortOrder": "desc", "page": 2, "pageSize": 10 }` 查询等级降序排列的第 2 页公司。业务 Service 从本模块白名单映射列名，相同排序值用主键稳定排序，然后分页。`total` 仍为所有匹配记录数。[用户列表](../bknd/src/users/user-management.service.ts) · [公司列表](../bknd/src/companies/companies.service.ts)

## 固定样例和验证

[联调样例](../contracts/tool-result.examples.ts)包含文本、用户表、公司表、空表、单图、组合报表、无权限和工具不可用。可在仓库根目录打印任一样例为 JSON，或运行前端测试验证它通过历史消息入口后的展示状态。

```sh
node --input-type=module -e "import { examples } from './contracts/tool-result.examples.ts'; console.log(JSON.stringify(examples.empty, null, 2))"
npm --prefix ftnd test
npm --prefix bknd test
```
