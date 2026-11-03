# 第三步：统计测试

dashboard.service.spec.ts 用小样本测试空表、缺失年份、累计和占比。
management.e2e-spec.ts 通过真实HTTP请求验证登录保护，并把API公司数量、等级总数和最后一年累计数同数据库对照。
在bknd运行 npm test 和 npm run test:e2e。测试创建自己的临时账号并清理，不修改已有公司。
