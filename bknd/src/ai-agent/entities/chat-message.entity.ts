export type ChatRole = 'user' | 'assistant';
export type ChatMessageType = 'text' | 'table' | 'chart' | 'report' | 'confirmation';

/** content保存对象，例如文本消息可使用 {text: '你好'}；不同类型的具体内容后续定义。 */
export class ChatMessageEntity {
  id!: string;
  sessionId!: string;
  // PostgreSQL bigint由pg默认作为字符串返回，避免超过JS安全整数范围。
  position!: string;
  role!: ChatRole;
  messageType!: ChatMessageType;
  content!: Record<string, unknown>;
  createdAt!: Date;
  /** 用户消息关联的生成状态；旧消息或AI消息可能没有对应回合。 */
  turnId?: string | null;
  turnStatus?: 'pending' | 'completed' | 'failed' | null;
  errorCode?: string | null;
}
