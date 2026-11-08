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
}
