# 第三周第二步 · 聊天指令与浏览器联调验收

2026-11-25，在两个独立的 Chromium 登录会话中分别使用测试管理员和普通账号，通过 Next.js 聊天窗口发送指令。两轮验收使用相同的合成样本，每轮独立启动 PostgreSQL、Redis、Nest 和 Next.js。固定模型回归和目标模型 Qwen `qwen3.7-flash` 的四条指令均通过。下表参数取自当次工具注册中心实际收到的调用。

| 身份与聊天指令 | 实际工具 | 固定模型实参 | 目标模型实参 | 两轮页面结果 |
| --- | --- | --- | --- | --- |
| 管理员「查询状态为启用的 Analyst 用户，按姓名升序，显示第一页。」 | `query_users` | `{"status":"active","roles":["Analyst"],"sortBy":"name","sortOrder":"asc","page":1}` | `{"page":1,"pageSize":10,"sortOrder":"asc","sortBy":"name","status":"active","roles":["Analyst"]}` | 第 1 页共 2 人，表格依次显示 Ada、Lin F，岗位和状态分别为 Analyst、启用。 |
| 普通用户「查询英国伦敦等级为 2 或 3 的公司。」 | `query_companies` | `{"country":"UK","city":"London","levels":[2,3]}` | `{"country":"UK","city":"London","levels":[2,3],"pageSize":10,"sortBy":"companyName"}` | 显示 Alpha、Beta、Cedar。展开 Cedar 可见年营收 42、员工数 0。 |
| 普通用户「查看 2018 到 2020 年成立的英国公司的总营收和等级分布。」 | `dashboard_metrics` | `{"country":"UK","foundedYearFrom":2018,"foundedYearTo":2020,"charts":["levelDistribution"]}` | `{"foundedYearFrom":2018,"foundedYearTo":2020,"country":"UK","charts":["levelDistribution"],"view":"report"}` | 共 5 家，总收入原值 1,782。等级 2、3、4 各有 2、2、1 家，环形图旁的表格分别显示 40%、40%、20%。 |
| 普通用户「查询用户列表。」 | `query_users` | `{}` | `{"page":1,"pageSize":10}` | 显示“你没有权限执行此查询。”。业务用户列表调用增量为 0，刷新后仍显示权限提示，持久化历史中的错误码为 `FORBIDDEN`，没有用户明细。 |

## 边界场景与历史恢复

以下项目在固定模型模式通过。应用的注册中心、权限检查、业务查询、审计和历史读取均走实际链路。

| 场景 | 验收观察 |
| --- | --- |
| 空结果 | 普通用户查询 Atlantis 的公司，页面显示“没有符合条件的记录”，总数为 0。 |
| 工具禁用 | 关闭公司工具后，页面显示“该工具暂不可用，请稍后再试。”，公司列表调用次数不增加。同一期间 Dashboard 查询成功，恢复开关后公司查询成功。 |
| 业务异常 | 测试使公司列表查询抛出一次异常，页面显示“查询未完成，请稍后重试。”，内部异常信息未出现在对话框。 |
| 刷新和切换会话 | 刷新原会话后仍能展开 Cedar 详情。切换到新建会话后看不到原会话的公司表，切回后表格、等级图和历史消息恢复，历史消息与切换前逐项一致。普通账号读取管理员会话返回 404。 |

## 复跑与定位

在仓库根目录运行固定模型回归。脚本依赖 Node.js 24、Docker、已安装的前后端依赖和 Playwright Chromium。

```sh
bash bknd/scripts/verify-ai-tools-browser.sh fixture
```

目标模型联调使用后端配置的模型，通过浏览器发送上述四条指令。若配置位于当前工作副本的 `bknd/.env.ai` 或服务端环境变量中，直接运行下列命令。配置位于其他项目工作副本时，设置 `AI_TEST_MODEL_ENV` 为该文件的绝对路径。要观察浏览器操作，可在命令前加 `HEADED=1`。

```sh
bash bknd/scripts/verify-ai-tools-browser.sh target
```

每条指定指令输出一行记录，包含运行模式、原始指令、实际工具、实际参数和页面断言结果。排查时先看模型选中的工具和筛选条件，再用同一账号的业务 GET 接口核对数值，最后对照聊天历史和可见页面元素。例如，总营收指令要求统计英国所有等级的公司。样本特意加入了伦敦以外的公司和一家等级 4 的公司，误沿用上一轮的城市或等级筛选会导致总收入和分布断言失败。

[浏览器指令与页面断言](../bknd/scripts/verify-chat-commands.mjs) · [浏览器启动与原有回归](../bknd/scripts/verify-ai-tools-browser.mjs) · [第一步业务接口对照](../bknd/test/read-tool-api.e2e-spec.ts)
