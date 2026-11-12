import { describe, expect, it, vi } from 'vitest';
import { createChatModel } from './model.factory.js';
import { ModelError } from './chat-model.types.js';
import type { FetchLike } from './openai-compatible.adapter.js';

const messages = [{role:'user' as const, content:'  第一行\n第二行  '}];
function setup(provider: string, status = 200, payload: unknown = {choices:[{message:{content:'你好'},finish_reason:'stop'}]}) {
  const prefix = 'AI_' + provider.toUpperCase() + '_';
  const env: Record<string,string> = {AI_MODEL_PROVIDER:provider,[prefix+'API_KEY']:'private-test-key',
    [prefix+'BASE_URL']:'https://model.example/v1/',[prefix+'MODEL']:'test-model'};
  const transport = vi.fn(async () => new Response(JSON.stringify(payload),{status}));
  const model = createChatModel({get:key=>env[key]},transport as FetchLike);
  return {model,transport,env};
}

describe('模型统一适配器', () => {
  it.each(['qwen','deepseek','gpt','kimi'])('%s 保持统一消息、配置和返回格式', async provider => {
    const {model,transport} = setup(provider);
    expect(await model.chat(messages)).toEqual({provider,model:'test-model',text:'你好',finishReason:'stop'});
    const [url,init] = transport.mock.calls[0] as unknown as [URL,RequestInit];
    expect(url.toString()).toBe('https://model.example/v1/chat/completions');
    expect(init.redirect).toBe('error');
    expect(init.headers).toMatchObject({Authorization:'Bearer private-test-key'});
    expect(typeof init.body).toBe('string');
    expect(JSON.parse(init.body as string)).toEqual({model:'test-model',messages,stream:false,
      ...(provider === 'qwen' ? {enable_thinking:false} : {})});
  });
  it('多轮消息按顺序传递，不改动输入文字', async () => {
    const {model,transport} = setup('qwen');
    const history = [...messages,{role:'assistant' as const,content:'上一轮回复'},{role:'user' as const,content:'继续'}];
    await model.chat(history);
    const [,init] = transport.mock.calls[0] as unknown as [URL,RequestInit];
    expect(typeof init.body).toBe('string');
    expect(JSON.parse(init.body as string).messages).toEqual(history);
  });
  it.each([[401,'authentication'],[403,'authentication'],[429,'rate_limit'],[500,'upstream']])(
    'HTTP %i 返回安全的%s错误', async (status,kind) => {
      const {model} = setup('kimi',status,{error:'private-test-key'});
      try { await model.chat(messages); throw new Error('expected failure'); }
      catch (error) {
        expect(error).toBeInstanceOf(ModelError);
        expect((error as ModelError).kind).toBe(kind);
        expect(String(error)).not.toContain('private-test-key');
      }
    },
  );
  it('拒绝不安全地址、缺失配置、未知厂商、空消息和异常响应', async () => {
    expect(()=>createChatModel({get:key=>({AI_MODEL_PROVIDER:'unknown'} as Record<string,string>)[key]})).toThrow(ModelError);
    const {model,env} = setup('gpt');
    env.AI_GPT_BASE_URL = 'http://remote.example/v1';
    expect(()=>createChatModel({get:key=>env[key]})).toThrow(ModelError);
    env.AI_GPT_BASE_URL = 'https://model.example/v1?key=secret';
    expect(()=>createChatModel({get:key=>env[key]})).toThrow(ModelError);
    delete env.AI_GPT_API_KEY;
    expect(()=>createChatModel({get:key=>env[key]})).toThrow(ModelError);
    await expect(model.chat([])).rejects.toMatchObject({kind:'invalid_input'});
    await expect(setup('deepseek',200,{choices:[]}).model.chat(messages)).rejects.toMatchObject({kind:'invalid_response'});
  });
  it('超时、网络错误统一处理，不暴露底层敏感信息', async () => {
    const env={AI_MODEL_PROVIDER:'qwen',AI_QWEN_API_KEY:'test-key',AI_QWEN_MODEL:'test',AI_QWEN_BASE_URL:'https://model.example'};
    const model = createChatModel({get:key=>(env as Record<string,string>)[key]},
      vi.fn(async()=>{throw new DOMException('secret payload','TimeoutError');}) as FetchLike);
    await expect(model.chat(messages)).rejects.toMatchObject({kind:'timeout'});
  });
});
