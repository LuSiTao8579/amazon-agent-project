/** 模型无关的文本输入输出；不包含文件上传或工具调用。 */
export type ModelProvider = 'qwen' | 'deepseek' | 'gpt' | 'kimi';
export type ModelMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type ModelReply = { provider: ModelProvider; model: string; text: string; finishReason: string | null };
export interface ChatModel { chat(messages: ModelMessage[]): Promise<ModelReply>; }

/** 上游错误统一成可安全展示的类型，不包含API Key、响应体或用户对话。 */
export class ModelError extends Error {
  constructor(public readonly kind: 'configuration' | 'invalid_input' | 'authentication' | 'rate_limit' | 'upstream' | 'timeout' | 'invalid_response',
    message: string) { super(message); this.name = 'ModelError'; }
}
