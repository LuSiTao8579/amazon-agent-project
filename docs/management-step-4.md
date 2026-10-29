# 第四步：User 页面

新增 management-table.tsx 复用 MUI Table、TextField、Dialog、Checkbox 展示真实用户。
搜索/岗位多选和分页由服务端查询；修改成功后重新取数，刷新页面不会丢失数据。
新增用户输入初始密码，后端做哈希。管理员不可通过页面编辑/删除。
删除需要确认，批量选择仅限当前页普通用户；筛选或换页清空选择。

api/manage/[...path]/route.ts 是白名单代理：读取 HttpOnly Cookie，在服务器给 NestJS 添加 Bearer Token。
浏览器只拿公开用户信息。修改请求检查 Origin 和 JSON 类型，后端仍独立检查权限。

阅读顺序：user/page.tsx → management-table.tsx → API代理 → bknd/src/users/user-management.controller.ts → service。
