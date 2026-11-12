import { ModelError, type ChatModel, type ModelProvider } from './chat-model.types.js';
import { DeepSeekAdapter, GptAdapter, KimiAdapter, QwenAdapter, type FetchLike, type ModelConfig } from './openai-compatible.adapter.js';

export type ModelEnvironment = { get(key: string): string | undefined };
const providers = ['qwen','deepseek','gpt','kimi'] as const;
const defaults: Partial<Record<ModelProvider,string>> = {
  deepseek:'https://api.deepseek.com',
  gpt:'https://api.openai.com/v1',
};

/** 配置只从服务器环境获取，调用者不能通过HTTP请求传入Key或模型地址。 */
export function createChatModel(env: ModelEnvironment, transport?: FetchLike): ChatModel {
  const selected = env.get('AI_MODEL_PROVIDER')?.trim().toLowerCase() || 'qwen';
  if (!providers.includes(selected as ModelProvider)) throw new ModelError('configuration','不支持的模型厂商');
  const provider = selected as ModelProvider;
  const prefix = 'AI_' + provider.toUpperCase() + '_';
  const config: ModelConfig = { provider, apiKey: env.get(prefix+'API_KEY') ?? '',
    model: env.get(prefix+'MODEL') ?? '', baseUrl: env.get(prefix+'BASE_URL') || defaults[provider] || '' };
  switch (provider) {
    case 'qwen': return new QwenAdapter(config,transport);
    case 'deepseek': return new DeepSeekAdapter(config,transport);
    case 'gpt': return new GptAdapter(config,transport);
    case 'kimi': return new KimiAdapter(config,transport);
  }
}
