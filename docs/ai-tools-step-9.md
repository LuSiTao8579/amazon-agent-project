# AI Agent 第二周第九步 · Dashboard 综合指标

## 在聊天框查询

登录后输入“查看 2018 至 2020 年成立、英国、等级 2 或 3 的公司综合指标和图表”。工具名为 `dashboard_metrics`，归属 `STATISTICS_ANALYSIS`，使用已有的 `dashboard.read` 权限。对应的工具参数如下。

```json
{
  "foundedYearFrom": 2018,
  "foundedYearTo": 2020,
  "country": "UK",
  "levels": [2, 3],
  "view": "report"
}
```

时间范围采用第一步建议的**公司成立年份**口径，首尾年份均包含，可只传一端。查询单一年份时，将上下限设为同一年。国家按完整名称匹配，忽略大小写和首尾空格。不同条件取交集，多个等级选中任意一个即可。无筛选时返回全量公司统计。总收入为入选公司的年营收合计，数据沿用公司表的原始单位。[业务查询](../bknd/src/dashboard/dashboard.service.ts)

## 选择报表或单图

| 想看什么 | 工具参数 `view` | 回复 |
| --- | --- | --- |
| 四张指标卡和两张图 | `report`，可以省略 | `resultType: report`，包含公司数、总收入、国家数、员工数及两组图表数据 |
| 只看等级占比 | `levelDistribution` | `resultType: chart`，每个等级返回数量及百分比 |
| 只看成立年份累计趋势 | `yearlyGrowth` | `resultType: chart`，每年返回新增数及累计数 |

三种展示均使用同一套统计。百分比的分母为筛选后的公司数。曲线从命中公司的最早成立年画到最晚成立年，中间没有新公司的年份补零，累计值保持上一年的数量。零匹配时四项指标都是 0，图表数组为空。卡片按既有 K/M/B 规则简写，接口和聊天历史保留原始数值。[工具输出](../bknd/src/ai/tools/business-tools.ts) · [卡片展示](../ftnd/src/components/dashboard-metrics.tsx)

## 怎样核对

用同一登录身份调用 `GET /dashboard?foundedYearFrom=2018&foundedYearTo=2020&country=UK&levels=2,3`，即可对照聊天报表的 `data`。业务 API 始终返回完整看板，`view` 是聊天工具的展示选项。

例如，筛选后有 3 家公司，2018 年成立 1 家、2020 年成立 2 家。其中 2 家属于等级 2，1 家属于等级 3。等级占比分别约为 66.67% 和 33.33%，逐年累计为 1、1、3。各等级数量之和、曲线末点和公司数卡片都应为 3。在 `bknd/` 运行 `bash scripts/verify-ai-foundation.sh` 可用临时 PostgreSQL 和 Redis 复验这个样例、单边年份、空结果、非法区间和单图历史恢复。[聊天端到端验收](../bknd/test/ai-chat-turn.e2e-spec.ts)
