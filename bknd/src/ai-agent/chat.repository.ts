import { Inject, Injectable } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../database/database.module.js';
import type { ChatSessionEntity } from './entities/chat-session.entity.js';
import type { ChatMessageEntity, ChatMessageType, ChatRole } from './entities/chat-message.entity.js';

const SESSION_COLUMNS = 'id, user_id AS "userId", title, created_at AS "createdAt", updated_at AS "updatedAt"';
const MESSAGE_COLUMNS = 'id, session_id AS "sessionId", position, role, message_type AS "messageType", content, created_at AS "createdAt"';

/** 本步只实现数据访问，后续Controller必须传入经过JWT验证的用户ID。 */
@Injectable()
export class ChatRepository {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async createSession(userId: string, title = '新会话'): Promise<ChatSessionEntity> {
    const { rows } = await this.pool.query<ChatSessionEntity>(
      `INSERT INTO ai_chat_sessions(user_id, title) VALUES ($1, $2) RETURNING ${SESSION_COLUMNS}`, [userId, title]);
    return rows[0];
  }

  async listSessions(userId: string, limit = 101, offset = 0): Promise<ChatSessionEntity[]> {
    const { rows } = await this.pool.query<ChatSessionEntity>(
      `SELECT ${SESSION_COLUMNS} FROM ai_chat_sessions WHERE user_id = $1 ORDER BY updated_at DESC, id LIMIT $2 OFFSET $3`, [userId, limit, offset]);
    return rows;
  }

  async getSession(userId: string, sessionId: string): Promise<ChatSessionEntity | null> {
    const { rows } = await this.pool.query<ChatSessionEntity>(
      `SELECT ${SESSION_COLUMNS} FROM ai_chat_sessions WHERE id = $1 AND user_id = $2`, [sessionId, userId]);
    return rows[0] ?? null;
  }

  async addMessage(userId: string, sessionId: string, role: ChatRole, messageType: ChatMessageType,
    content: Record<string, unknown>): Promise<ChatMessageEntity | null> {
    // INSERT ... SELECT 同时检查归属；没有权限时不会插入消息。
    // 一条SQL内更新会话时间，让最近会话排序反映最新消息。
    const { rows } = await this.pool.query<ChatMessageEntity>(`
      WITH owned AS (
        UPDATE ai_chat_sessions SET updated_at = now()
        WHERE id = $1 AND user_id = $2 RETURNING id
      )
      INSERT INTO ai_chat_messages(session_id, role, message_type, content)
      SELECT id, $3, $4, $5::jsonb FROM owned RETURNING ${MESSAGE_COLUMNS}`,
      [sessionId, userId, role, messageType, JSON.stringify(content)]);
    return rows[0] ?? null;
  }

  async listMessages(userId: string, sessionId: string, limit = 101, offset = 0): Promise<ChatMessageEntity[]> {
    // 读取同样带user_id条件，不能只凭sessionId访问别人的内容。
    const { rows } = await this.pool.query<ChatMessageEntity>(`
      SELECT m.id, m.session_id AS "sessionId", m.position, m.role,
        m.message_type AS "messageType", m.content, m.created_at AS "createdAt"
      FROM ai_chat_messages m JOIN ai_chat_sessions s ON s.id = m.session_id
      WHERE s.id = $1 AND s.user_id = $2 ORDER BY m.position LIMIT $3 OFFSET $4`, [sessionId, userId, limit, offset]);
    return rows;
  }
}
