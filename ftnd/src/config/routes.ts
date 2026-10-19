// Unified route and workspace navigation configuration.
// Adding a new workspace entry in `workspaceSections` automatically updates
// the shared navigation bar and auth page feature list without scattered edits.
export const routes = {
  signup: '/signup',
  login: '/login',
  dashboard: '/dashboard',
  company: '/company',
  order: '/order',
  user: '/user',
} as const;

export const workspaceSections = {
  dashboard: {
    key: 'dashboard',
    title: 'Dashboard',
    subtitle: '数据总览',
    href: routes.dashboard,
    description:
      '后续展示供应链统计、订单状态与重要变化。当前仅提供页面框架与模块占位，不伪造业务统计数据。',
    placeholders: [
      {
        title: '核心业务指标概览',
        summary: '后续接入真实供应链统计指标与周期变化，当前不展示模拟数值或虚构图表。',
      },
      {
        title: '近期订单与履约动态',
        summary: '后续汇总订单流转、发货与签收状态变化，支持快速定位关键业务节点。',
      },
      {
        title: '风险预警与待办提醒',
        summary: '后续展示库存、交期与供应商异常提醒，辅助日常运营协同。',
      },
    ],
  },
  company: {
    key: 'company',
    title: 'Company',
    subtitle: '供应链公司',
    href: routes.company,
    description:
      '后续展示合作供应链公司档案及其业务状态。当前仅提供页面框架与模块占位，暂不实现公司增删改查。',
    placeholders: [
      {
        title: '合作公司名录',
        summary: '后续展示供应商、物流商与合作方列表，支持按名称、状态与合作类型检索。',
      },
      {
        title: '企业资质与合作状态',
        summary: '后续展示企业主体信息、合同周期与准入状态，不预置虚构企业数据。',
      },
      {
        title: '协同与履约记录',
        summary: '后续关联该公司下的历史订单、交付表现与沟通记录。',
      },
    ],
  },
  order: {
    key: 'order',
    title: 'Order',
    subtitle: '订单追踪',
    href: routes.order,
    description:
      '后续展示订单信息与履约进度。当前仅提供页面框架与模块占位，暂不实现订单列表、状态更新或订单统计。',
    placeholders: [
      {
        title: '订单列表与筛选',
        summary: '后续支持按订单号、合作公司、创建时间与当前状态查询真实订单。',
      },
      {
        title: '履约与物流节点追踪',
        summary: '后续展示从下单、出库、运输到签收的关键时间线与状态变更记录。',
      },
      {
        title: '交付异常与处理记录',
        summary: '后续记录延期、缺货或签收异常及对应跟进措施。',
      },
    ],
  },
  user: {
    key: 'user',
    title: 'User',
    subtitle: '用户与账户',
    href: routes.user,
    description:
      '后续展示用户资料、安全设置与账户管理功能。当前已接入真实登录身份校验，其他管理模块为页面框架占位。',
    placeholders: [
      {
        title: '账户基本资料',
        summary: '当前已通过后端 /auth/me 验证并展示真实登录邮箱，后续可扩展资料维护。',
      },
      {
        title: '密码与会话安全',
        summary: '当前采用 Argon2id 密码哈希与短期 HttpOnly Cookie 会话，后续可扩展修改密码与会话管理。',
      },
      {
        title: '团队成员与权限配置',
        summary: '后续按业务需求扩展多成员协作、角色分配与访问控制策略。',
      },
    ],
  },
} as const;

export type WorkspaceSection = keyof typeof workspaceSections;
export type WorkspaceSectionConfig = (typeof workspaceSections)[WorkspaceSection];

export const workspaceNavItems: readonly WorkspaceSectionConfig[] =
  Object.values(workspaceSections);

export function isActiveWorkspacePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
