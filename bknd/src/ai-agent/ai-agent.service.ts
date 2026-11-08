import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ChatRepository } from './chat.repository.js';
import { ChatTurnRepository } from './chat-turn.repository.js';
import type { ChatPageDto, CreateChatMessageDto, CreateChatSessionDto } from './ai-agent.dto.js';

@Injectable()
export class AiAgentService {
  constructor(@Inject(ChatRepository) private readonly chats: ChatRepository,
    @Inject(ChatTurnRepository) private readonly turns: ChatTurnRepository) {}

  async createSession(userId: string, input: CreateChatSessionDto) {
    return this.chats.createSession(userId, input.title);
  }

  async listSessions(userId: string, paging: ChatPageDto) {
    const rows = await this.chats.listSessions(userId, paging.pageSize + 1, (paging.page - 1) * paging.pageSize);
    return { items: rows.slice(0, paging.pageSize), page: paging.page, pageSize: paging.pageSize, hasMore: rows.length > paging.pageSize };
  }

  async getSession(userId: string, sessionId: string) {
    const session = await this.chats.getSession(userId, sessionId);
    if (!session) throw new NotFoundException('会话不存在');
    return session;
  }

  async deleteSession(userId: string, sessionId: string) {
    // 与生成回复使用相同的会话锁，避免生成过程中删除。
    return this.turns.withSessionLock(userId, sessionId, async client => {
      if (!await this.chats.softDelete(client, userId, sessionId)) throw new NotFoundException('会话不存在');
      return { deleted: true };
    });
  }

  async listMessages(userId: string, sessionId: string, paging: ChatPageDto) {
    // 不存在与他人会话统一返回404，不泄露会话是否属于其他人。
    if (!(await this.chats.getSession(userId, sessionId))) throw new NotFoundException('会话不存在');
    const rows = await this.chats.listMessages(userId, sessionId, paging.pageSize + 1, (paging.page - 1) * paging.pageSize);
    return { items: rows.slice(0, paging.pageSize), page: paging.page, pageSize: paging.pageSize, hasMore: rows.length > paging.pageSize };
  }

  async createMessage(userId: string, sessionId: string, input: CreateChatMessageDto) {
    // 模型调用在后续步骤接入，此接口当前只保存用户文本。
    const message = await this.chats.addMessage(userId, sessionId, 'user', 'text', { text: input.text });
    if (!message) throw new NotFoundException('会话不存在');
    return message;
  }
}
