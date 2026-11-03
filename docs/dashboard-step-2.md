# 第二步：后端统计接口

GET /dashboard 使用 JWT 鉴权；DashboardService 用一条 SQL 聚合全部公司，保证卡片和图表读取同一时刻的数据。
summary 是四项汇总，levels 统计等级数量，years 按成立年份计数；buildDashboard 补齐缺失年份并计算累计。
查询不更改现有公司表。接口没有货币单位转换；数字为方便图表转成 JavaScript 数字，极大数值需进一步处理精度。
