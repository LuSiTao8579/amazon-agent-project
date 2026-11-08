import { ConflictException, HttpException, Inject, Injectable } from '@nestjs/common';
import { ChatTurnRepository } from './chat-turn.repository.js';
import { ModelService } from './providers/model.service.js';
import { ModelError } from './providers/chat-model.types.js';
import type { CreateChatTurnDto } from './chat-turn.dto.js';

@Injectable()
export class ChatTurnService {
  constructor(@Inject(ChatTurnRepository) private readonly turns:ChatTurnRepository,
    @Inject(ModelService) private readonly model:ModelService) {}

  async send(userId:string, sessionId:string, input:CreateChatTurnDto) {
    return this.turns.withSessionLock(userId,sessionId,async client=>{
      const existing=await this.turns.findTurn(client,sessionId,input.requestId);
      if (existing) {
        if (existing.text !== input.text) throw new ConflictException('该请求编号已用于其他消息');
        if (existing.status !== 'completed' || !existing.assistant_message_id)
          throw new ConflictException('该请求未成功；如需再次尝试，请使用新的请求编号');
        return {turnId:existing.id,status:'completed',
          userMessage:await this.turns.message(client,existing.user_message_id),
          assistantMessage:await this.turns.message(client,existing.assistant_message_id)};
      }
      const started=await this.turns.beginTurn(client,userId,sessionId,input.requestId,input.text);
      try {
        const context=await this.turns.context(client,sessionId,input.text);
        const reply=await this.model.chat(context);
        const assistantMessage=await this.turns.complete(client,started.turnId,sessionId,reply);
        return {turnId:started.turnId,status:'completed',userMessage:started.userMessage,assistantMessage};
      } catch(error) {
        const kind=error instanceof ModelError ? error.kind : 'internal';
        await this.turns.fail(client,started.turnId,kind);
        // 不返回厂商响应体、密钥、数据库异常或原始对话上下文。
        throw new HttpException({message:'模型回复未完成，请稍后重试',turnId:started.turnId,
          userMessageId:started.userMessage.id,status:'failed',errorCode:kind},
          kind === 'timeout' ? 504 : 502);
      }
    });
  }
}
