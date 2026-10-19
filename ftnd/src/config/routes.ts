// Shared route names for page links; this is not an access-control list.
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
    title: 'Dashboard',
    subtitle: '数据总览',
    href: routes.dashboard,
    description: '后续展示供应链统计、订单状态与重要变化。本步骤不添加图表或模拟业务数据。',
  },
  company: {
    title: 'Company',
    subtitle: '供应链公司',
    href: routes.company,
    description: '后续展示供应链公司及其业务状态。本步骤不实现公司列表、增删改查或风险判断。',
  },
  order: {
    title: 'Order',
    subtitle: '订单追踪',
    href: routes.order,
    description: '后续展示订单信息与进度。本步骤不实现订单列表、状态更新或订单统计。',
  },
  user: {
    title: 'User',
    subtitle: '用户与账户',
    href: routes.user,
    description: '后续展示用户与账户相关内容。本步骤不实现用户管理、个人资料或权限设置。',
  },
} as const;

export type WorkspaceSection = keyof typeof workspaceSections;
