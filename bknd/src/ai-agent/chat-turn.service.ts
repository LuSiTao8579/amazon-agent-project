import { ConflictException, HttpException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ChatTurnRepository } from './chat-turn.repository.js';
import { ModelService } from './providers/model.service.js';
import { ToolRegistryService } from '../ai/tools/tool-registry.service.js';
import type { ToolContext } from '../jwt-auth.guard.js';
import { candidateTools } from './providers/chat-tools.js';
import { toolTurnReply, visibleMessage, type TurnReply } from './turn-reply.js';
import { ModelError } from './providers/chat-model.types.js';
import type { ModelMessage } from './providers/chat-model.types.js';
import type { ChatMessageEntity } from './entities/chat-message.entity.js';
import { AiSessionContextCache, type SessionTurn } from '../ai/cache/ai-session-context.cache.js';
import type { CreateChatTurnDto } from './chat-turn.dto.js';

function modelContext(turns: SessionTurn[], text: string): ModelMessage[] {
  let size = text.length;
  let start = turns.length;
  while (start > 0) {
    const { user, assistant } = turns[start - 1];
    size += user.length + assistant.length;
    if (user.length > 16000 || assistant.length > 16000 || size > 32000) break;
    start--;
  }
  return [...turns.slice(start).flatMap(turn => [
    { role: 'user' as const, content: turn.user }, { role: 'assistant' as const, content: turn.assistant },
  ]), { role: 'user', content: text }];
}

@Injectable()
export class ChatTurnService {
  constructor(@Inject(ChatTurnRepository) private readonly turns:ChatTurnRepository,
    @Inject(AiSessionContextCache) private readonly memory: AiSessionContextCache,
    @Inject(ToolRegistryService) private readonly tools: ToolRegistryService,
    @Inject(ModelService) private readonly model:ModelService) {}

  private async answer(turns: SessionTurn[], text: string, context: ToolContext | undefined): Promise<TurnReply> {
    if (/^(?:请|帮我|请帮我)?(?:查询|查|看看|看)(?:一下|一查)?(?:业务)?数据[。？！?!]*$/u.test(text.replace(/\s/g, ''))) {
      const question = '你想查询公司、用户，还是查看 Dashboard 汇总指标？';
      return { messageType: 'text', content: { text: question }, summary: question };
    }
    let names = candidateTools(text);
    // 具名查询由注册中心统一执行并审计拒绝；开放式对话只向模型列出当前可发现的工具。
    if (names.length > 1) {
      try {
        const available = context ? await this.tools.listAvailable(context) : [];
        names = names.filter(name => available.some(meta => meta.name === name));
      } catch (error) {
        if (!(error instanceof ServiceUnavailableException)) throw error;
        names = [];
      }
    }
    const reply = await this.model.chat(modelContext(turns, text), names);
    if ('tool' in reply) {
      return toolTurnReply(await this.tools.execute(reply.tool, context, reply.args));
    }
    return { messageType: 'text', content: { ...reply }, summary: reply.text };
  }

  async send(userId:string, sessionId:string, input:CreateChatTurnDto, context: ToolContext | undefined) {
    return this.turns.withSessionLock(userId,sessionId,async (client, history)=>{
      const existing=await this.turns.findTurn(client,sessionId,input.requestId);
      if (existing) {
        if (existing.text !== input.text) throw new ConflictException('该请求编号已用于其他消息');
        if (existing.status !== 'completed' || !existing.assistant_message_id)
          throw new ConflictException('该请求未成功；如需再次尝试，请使用新的请求编号');
        return {turnId:existing.id,status:'completed',
          userMessage:await this.turns.message(client,existing.user_message_id),
          assistantMessage:visibleMessage(await this.turns.message(client,existing.assistant_message_id), context)};
      }
      const started=await this.turns.beginTurn(client,userId,sessionId,input.requestId,input.text);
      const key = { kind: 'session', userId, sessionId } as const;
      const load = () => this.turns.completedTurns(client, userId, sessionId, history.turnIds);
      let turns: SessionTurn[];
      let assistantMessage: ChatMessageEntity;
      try {
        turns = history.status === 'active' ? await this.memory.read(key, history.turnIds, load) : await load();
        const reply = await this.answer(turns, input.text, context);
        assistantMessage = await this.turns.complete(client, started.turnId, sessionId, reply);
        turns.push({ turnId: started.turnId, user: input.text, assistant: reply.summary });
      } catch(error) {
        const kind=error instanceof ModelError ? error.kind : 'internal';
        await this.turns.fail(client,started.turnId,kind);
        // 不返回厂商响应体、密钥、数据库异常或原始对话上下文。
        throw new HttpException({message:'模型回复未完成，请稍后重试',turnId:started.turnId,
          userMessageId:started.userMessage.id,status:'failed',errorCode:kind},
          kind === 'timeout' ? 504 : 502);
      }
      if (history.status === 'active') await this.memory.store(key, turns);
      return {turnId:started.turnId,status:'completed',userMessage:started.userMessage,assistantMessage};
    });
  }
}
