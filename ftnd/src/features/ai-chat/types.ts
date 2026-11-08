/** 每种消息用 type 区分，新增类型时由渲染器明确处理。 */
type MessageBase = {
  id: string;
  role: 'user' | 'assistant';
  createdAt: string | null;
  turnStatus: 'pending' | 'completed' | 'failed' | null;
  attachments?: { id: string; name: string; size: number }[];
};

type DeferredContent = { title: string | null };
export type ChatMessage = MessageBase & (
  | { type: 'text'; content: { text: string } }
  | { type: 'table'; content: DeferredContent }
  | { type: 'chart'; content: DeferredContent }
  | { type: 'report'; content: DeferredContent }
  | { type: 'confirmation'; content: DeferredContent }
  | { type: 'unsupported'; content: { reason: string } }
);
export type TextMessage = Extract<ChatMessage, { type: 'text' }>;
export type RecentHistory = {
  session: { id: string; title: string } | null;
  messages: ChatMessage[];
  hasMore: boolean;
};
