# 第五步：Company 折叠表格

company/page.tsx 复用 management-table.tsx，读取真实 companies 接口。
外层展示名称、等级、国家、人均年营收；展开查看城市、成立年份、年营收、员工数。
搜索按公司名，等级可多选；管理员可新增、修改和删除无关联公司。
有关系的公司删除返回409，并在确认框保留错误消息，不能绕过数据库保护。

营收/员工数由后端计算，员工为0时返回null。色阶是明确标注的演示区间，不代表风险或利润。
CSV没有币种及供应日期，因此使用原始金额单位和“成立年份”，没有捏造供应日期。
等级筛选提供1–100，对应后端允许范围；当前CSV使用1–4。

阅读顺序：company/page.tsx → management-table.tsx 的 Collapse → companies.service.ts 的 SQL。
