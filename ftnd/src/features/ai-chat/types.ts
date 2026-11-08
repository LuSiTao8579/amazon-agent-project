/** 第6步仅用于展示最近会话的已保存文本；后续步骤扩展完整消息类型。 */
export type HistoryMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  turnStatus: string | null;
};
export type RecentHistory = {
  session: { id: string; title: string } | null;
  messages: HistoryMessage[];
  hasMore: boolean;
};
