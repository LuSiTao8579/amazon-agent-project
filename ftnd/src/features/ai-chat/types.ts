import type { CompanyRow, DashboardReport, ToolOutput, UserRow } from '../../../../contracts/tool-result.d.ts';

/** 每种消息用 type 区分，新增类型时由渲染器明确处理。 */
type MessageBase = {
  id: string;
  role: 'user' | 'assistant';
  createdAt: string | null;
  turnStatus: 'pending' | 'completed' | 'failed' | null;
  attachments?: { id: string; name: string; size: number }[];
};

type Title = { title: string | null };
type Page = { page: number; pageSize: number; total: number };
type TableContent = Page & { title: string; summary: string } & (
  { tableType: 'companies'; companies: CompanyRow[] } | { tableType: 'users'; users: UserRow[] }
);
export type ChatMessage = MessageBase & (
  | { type: 'text'; content: { text: string } }
  | { type: 'table'; content: TableContent }
  | { type: 'chart'; content: { title: string; summary: string; chart: Extract<ToolOutput, { resultType: 'chart' }>['data'] } }
  | { type: 'report'; content: { title: string; summary: string; report: DashboardReport } }
  | { type: 'legacy'; content: Title & { kind: 'table' | 'chart' | 'report' } }
  | { type: 'confirmation'; content: Title }
  | { type: 'tool-error'; content: { message: string } }
  | { type: 'unsupported'; content: { reason: string } }
);
export type TextMessage = Extract<ChatMessage, { type: 'text' }>;
export type RecentHistory = {
  session: { id: string; title: string } | null;
  messages: ChatMessage[];
  hasMore: boolean;
};
