import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { AiAgentService } from '../../ai-agent/ai-agent.service.js';
import { AiSessionContextCache } from '../cache/ai-session-context.cache.js';
import { AI_DATA_SOURCE, type AiSessionStatus } from '../ai.constants.js';
import type { CreateAiSessionDto, QueryAiSessionDto, UpdateAiSessionDto } from '../dto/ai-session.dto.js';
import { AiChatSessionEntity } from '../entities/ai-chat-session.entity.js';
import { aiPage, type AiPage } from './ai-page.js';
import { requireAiResourceId, requireAiUserId } from './ai-access.js';

/** 会话的身份、标题和活动时间沿用原有聊天会话；status 来自扩展表。 */
export interface AiSession {
  id: string;
  userId: string;
  title: string;
  status: AiSessionStatus;
  createdAt: Date;
  updatedAt: Date;
}

const SESSION_COLUMNS = `s.id, s.user_id AS "userId", s.title,
  COALESCE(a.status, 'active') AS status, s.created_at AS "createdAt", s.updated_at AS "updatedAt"`;

@Injectable()
export class AiSessionService {
  constructor(
    @InjectDataSource(AI_DATA_SOURCE) private readonly dataSource: DataSource,
    @Inject(AiAgentService) private readonly chats: AiAgentService,
    @Inject(AiSessionContextCache) private readonly memory: AiSessionContextCache,
  ) {}

  /** 两张会话记录在同一事务内创建，不能留下半条记录。 */
  async create(userId: string, input: CreateAiSessionDto): Promise<AiSession> {
    requireAiUserId(userId);
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        'INSERT INTO ai_chat_sessions(user_id,title) VALUES ($1,$2) RETURNING id',
        [userId, input.title ?? '新会话'],
      ) as Array<{ id: string }>;
      await manager.getRepository(AiChatSessionEntity).insert({ id: rows[0].id });
      return this.getFrom(manager, userId, rows[0].id);
    });
  }

  /** 旧会话缺扩展行时视为 active；读取不改写旧数据。 */
  async list(userId: string, query: QueryAiSessionDto): Promise<AiPage<AiSession>> {
    requireAiUserId(userId);
    const rows = await this.dataSource.query(`
      SELECT ${SESSION_COLUMNS} FROM ai_chat_sessions s
      LEFT JOIN ai_chat_session a ON a.id=s.id
      WHERE s.user_id=$1 AND s.deleted_at IS NULL
        AND ($2::text IS NULL OR COALESCE(a.status, 'active')=$2)
      ORDER BY s.updated_at DESC, s.id ASC LIMIT $3 OFFSET $4`,
      [userId, query.status ?? null, query.pageSize + 1, (query.page - 1) * query.pageSize]) as AiSession[];
    return aiPage(rows, query);
  }

  async get(userId: string, id: string): Promise<AiSession> {
    requireAiUserId(userId);
    requireAiResourceId(id, '会话');
    return this.getFrom(this.dataSource.manager, userId, id);
  }

  private async getFrom(manager: EntityManager, userId: string, id: string): Promise<AiSession> {
    const rows = await manager.query(`
      SELECT ${SESSION_COLUMNS} FROM ai_chat_sessions s
      LEFT JOIN ai_chat_session a ON a.id=s.id
      WHERE s.id=$1 AND s.user_id=$2 AND s.deleted_at IS NULL`, [id, userId]) as AiSession[];
    if (!rows[0]) throw new NotFoundException('会话不存在');
    return rows[0];
  }

  /** 与旧聊天模块使用同一咨询锁，避免生成回复时改变状态。 */
  async update(userId: string, id: string, input: UpdateAiSessionDto): Promise<AiSession> {
    requireAiUserId(userId);
    requireAiResourceId(id, '会话');
    return this.dataSource.transaction(async (manager) => {
      await this.getFrom(manager, userId, id);
      const locks = await manager.query(
        'SELECT pg_try_advisory_xact_lock(hashtextextended($1::uuid::text, 0)) AS locked', [id],
      ) as Array<{ locked: boolean }>;
      if (!locks[0].locked) throw new ConflictException('此会话正在生成回复，请稍后重试');
      // 再次按用户检查，避免首次检查与加锁之间会话被软删除。
      await this.getFrom(manager, userId, id);
      // 旧会话按需补建扩展行；不信任调用方提供的用户归属。
      await manager.query(`INSERT INTO ai_chat_session(id)
        SELECT s.id FROM ai_chat_sessions s
        WHERE s.id=$1 AND s.user_id=$2 AND s.deleted_at IS NULL
        ON CONFLICT (id) DO NOTHING`, [id, userId]);
      const updated = await manager.createQueryBuilder()
        .update(AiChatSessionEntity)
        .set({ status: input.status })
        .where('id = :id', { id })
        .andWhere(`EXISTS (SELECT 1 FROM ai_chat_sessions s
          WHERE s.id = :id AND s.user_id = :userId AND s.deleted_at IS NULL)`, { userId })
        .execute();
      if (updated.affected !== 1) throw new NotFoundException('会话不存在');
      await manager.query('UPDATE ai_chat_sessions SET updated_at=now() WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL', [id, userId]);
      if (input.status === 'closed') await this.memory.clear(userId, id);
      return this.getFrom(manager, userId, id);
    });
  }

  /** 复用现有软删除和会话锁，保留消息、附件及扩展行。 */
  async remove(userId: string, id: string): Promise<{ deleted: boolean }> {
    requireAiUserId(userId);
    requireAiResourceId(id, '会话');
    return this.chats.deleteSession(userId, id);
  }
}
