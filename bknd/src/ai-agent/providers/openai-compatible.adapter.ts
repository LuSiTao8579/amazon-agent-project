import { ModelError, type ChatModel, type ModelMessage, type ModelProvider, type ModelReply } from './chat-model.types.js';

export type ModelConfig = { provider: ModelProvider; apiKey: string; baseUrl: string; model: string };
export type FetchLike = typeof fetch;

export class OpenAICompatibleAdapter implements ChatModel {
  private readonly endpoint: URL;
  constructor(protected readonly config: ModelConfig, private readonly transport: FetchLike = fetch) {
    if (!config.apiKey.trim() || !config.model.trim()) throw new ModelError('configuration','模型名称或 API Key 未配置');
    let endpoint: URL;
    try {
      const url = new URL(config.baseUrl);
      const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
      if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
          url.username || url.password || url.search || url.hash) throw new Error('Invalid URL');
      endpoint = new URL(url.pathname.replace(/\/+$/, '') + '/chat/completions', url.origin);
    } catch { throw new ModelError('configuration','模型服务地址无效'); }
    this.endpoint = endpoint;
  }

  async chat(messages: ModelMessage[]): Promise<ModelReply> {
    if (!Array.isArray(messages) || messages.length < 1 || messages.length > 40 ||
      messages.some(m => !m || !['system','user','assistant'].includes(m.role) ||
        typeof m.content !== 'string' || !m.content.trim() || m.content.length > 16000))
      throw new ModelError('invalid_input','对话内容无效或超出长度限制');

    let response: Response;
    try {
      // 明确禁止重定向，避免服务地址配置错误时泄露Authorization；不自动重试以免重复计费。
      response = await this.transport(this.endpoint, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.apiKey}` },
        body: JSON.stringify({ model: this.config.model, messages, stream: false, ...this.extraBody() }),
      });
    } catch (error) {
      if (error instanceof Error && ['TimeoutError','AbortError'].includes(error.name))
        throw new ModelError('timeout','模型请求超时，请稍后重试');
      throw new ModelError('upstream','无法连接模型服务');
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new ModelError('authentication','模型服务认证失败，请检查服务配置');
      if (response.status === 429) throw new ModelError('rate_limit','模型服务请求过多，请稍后重试');
      throw new ModelError('upstream',`模型服务请求失败（HTTP ${response.status}）`);
    }
    let data: unknown;
    try { data = await response.json(); } catch { throw new ModelError('invalid_response','模型响应不是有效JSON'); }
    const choice = (data as { choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }> })?.choices?.[0];
    if (typeof choice?.message?.content !== 'string' || !choice.message.content.trim())
      throw new ModelError('invalid_response','模型未返回有效文本');
    return { provider: this.config.provider, model: this.config.model, text: choice.message.content,
      finishReason: typeof choice.finish_reason === 'string' ? choice.finish_reason : null };
  }

  protected extraBody(): Record<string, unknown> { return {}; }
}

// 当前千问测试模型支持此参数；其他厂商不会收到千问专有配置。
export class QwenAdapter extends OpenAICompatibleAdapter {
  protected override extraBody() { return { enable_thinking: false }; }
}
export class DeepSeekAdapter extends OpenAICompatibleAdapter {}
export class GptAdapter extends OpenAICompatibleAdapter {}
export class KimiAdapter extends OpenAICompatibleAdapter {}
