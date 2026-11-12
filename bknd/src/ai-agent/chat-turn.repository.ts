import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../database/database.module.js';
import type { AiSessionStatus } from '../ai/ai.constants.js';
import { SESSION_TURN_LIMIT, type SessionTurn } from '../ai/cache/ai-session-context.cache.js';
import type { ChatMessageEntity } from './entities/chat-message.entity.js';
import type { ModelReply } from './providers/chat-model.types.js';

type SessionHistory = { status: AiSessionStatus; turnIds: string[] };

type TurnRow = { id:string; status:'pending'|'completed'|'failed'; user_message_id:string; assistant_message_id:string|null; error_code:string|null; text:string };
const MESSAGE = 'id, session_id AS "sessionId", position, role, message_type AS "messageType", content, created_at AS "createdAt"';

/** 连接级咨询锁覆盖模型请求，防止同一会话并发打乱上下文；不同会话可并行。 */
@Injectable()
export class ChatTurnRepository {
  constructor(@Inject(PG_POOL) private readonly pool:pg.Pool) {}

  async withSessionLock<T>(userId:string, sessionId:string, work:(client:pg.PoolClient, history:SessionHistory)=>Promise<T>):Promise<T> {
    const client = await this.pool.connect();
    let locked = false;
    try {
      const owner = await client.query('SELECT 1 FROM ai_chat_sessions WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL',[sessionId,userId]);
      if (!owner.rowCount) throw new NotFoundException('会话不存在');
      const result = await client.query<{locked:boolean}>('SELECT pg_try_advisory_lock(hashtextextended($1::uuid::text, 0)) AS locked',[sessionId]);
      locked = result.rows[0].locked;
      if (!locked) throw new ConflictException('此会话正在生成回复，请稍后重试');
      // 获取锁后重新检查，避免会话在初次检查与加锁之间被删除。
      // 同次查询取最近已提交的回合 ID。缓存命中时无需从 PostgreSQL 加载消息正文。
      const stillOwned = await client.query<SessionHistory>(`
        SELECT COALESCE(a.status, 'active') AS status, ARRAY(
          SELECT t.id FROM ai_chat_messages u JOIN ai_chat_turns t ON t.user_message_id=u.id
          WHERE u.session_id=s.id AND t.session_id=s.id AND t.status='completed'
          ORDER BY u.position DESC LIMIT $3
        ) AS "turnIds"
        FROM ai_chat_sessions s LEFT JOIN ai_chat_session a ON a.id=s.id
        WHERE s.id=$1 AND s.user_id=$2 AND s.deleted_at IS NULL`, [sessionId,userId,SESSION_TURN_LIMIT]);
      if (!stillOwned.rowCount) throw new NotFoundException('会话不存在');
      // 上一个进程意外退出后连接锁会释放，遗留pending不代表还在运行。
      await client.query("UPDATE ai_chat_turns SET status='failed', error_code='interrupted' WHERE session_id=$1 AND status='pending'",[sessionId]);
      const history = stillOwned.rows[0];
      history.turnIds.reverse();
      return await work(client, history);
    } finally {
      let destroyConnection = false;
      if (locked) {
        try { await client.query('SELECT pg_advisory_unlock(hashtextextended($1::uuid::text, 0))',[sessionId]); }
        catch { destroyConnection = true; }
      }
      client.release(destroyConnection);
    }
  }

  async findTurn(client:pg.PoolClient, sessionId:string, requestId:string):Promise<TurnRow|null> {
    const {rows}=await client.query<TurnRow>(`SELECT t.id,t.status,t.user_message_id,t.assistant_message_id,t.error_code,
      m.content->>'text' AS text FROM ai_chat_turns t JOIN ai_chat_messages m ON m.id=t.user_message_id
      WHERE t.session_id=$1 AND t.request_id=$2`,[sessionId,requestId]);
    return rows[0] ?? null;
  }

  async beginTurn(client:pg.PoolClient, userId:string, sessionId:string, requestId:string, text:string) {
    await client.query('BEGIN');
    try {
      const owner=await client.query('UPDATE ai_chat_sessions SET updated_at=now() WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL RETURNING id',[sessionId,userId]);
      if (!owner.rowCount) throw new NotFoundException('会话不存在');
      const user=await client.query<ChatMessageEntity>(`INSERT INTO ai_chat_messages(session_id,role,message_type,content)
        VALUES ($1,'user','text',jsonb_build_object('text',$2::text)) RETURNING ${MESSAGE}`,[sessionId,text]);
      const turn=await client.query<{id:string}>("INSERT INTO ai_chat_turns(session_id,request_id,user_message_id,status) VALUES ($1,$2,$3,'pending') RETURNING id",[sessionId,requestId,user.rows[0].id]);
      await client.query('COMMIT');
      return {turnId:turn.rows[0].id,userMessage:user.rows[0]};
    } catch(error) {await client.query('ROLLBACK');throw error;}
  }

  async completedTurns(client: pg.PoolClient, userId: string, sessionId: string, ids: string[]): Promise<SessionTurn[]> {
    const { rows } = await client.query<SessionTurn>(`
      SELECT t.id AS "turnId", u.content->>'text' AS "user", a.content->>'text' AS assistant
      FROM ai_chat_turns t JOIN ai_chat_sessions s ON s.id=t.session_id
      JOIN ai_chat_messages u ON u.id=t.user_message_id AND u.session_id=s.id
      JOIN ai_chat_messages a ON a.id=t.assistant_message_id AND a.session_id=s.id
      WHERE s.id=$1 AND s.user_id=$2 AND s.deleted_at IS NULL AND t.status='completed'
        AND t.id=ANY($3::uuid[]) AND u.content->>'text' IS NOT NULL AND a.content->>'text' IS NOT NULL
      ORDER BY u.position`, [sessionId, userId, ids]);
    return rows;
  }

  async complete(client:pg.PoolClient, turnId:string, sessionId:string, reply:ModelReply) {
    await client.query('BEGIN');
    try {
      const a=await client.query<ChatMessageEntity>(`INSERT INTO ai_chat_messages(session_id,role,message_type,content)
        VALUES ($1,'assistant','text',$2::jsonb) RETURNING ${MESSAGE}`,
        [sessionId,JSON.stringify({text:reply.text,provider:reply.provider,model:reply.model,finishReason:reply.finishReason})]);
      const updated=await client.query("UPDATE ai_chat_turns SET status='completed',assistant_message_id=$2 WHERE id=$1 AND status='pending'",[turnId,a.rows[0].id]);
      if (updated.rowCount !== 1) throw new Error('对话状态已改变');
      await client.query('UPDATE ai_chat_sessions SET updated_at=now() WHERE id=$1',[sessionId]);
      await client.query('COMMIT');
      return a.rows[0];
    } catch(error) {await client.query('ROLLBACK');throw error;}
  }

  async fail(client:pg.PoolClient, turnId:string, errorCode:string) {
    await client.query("UPDATE ai_chat_turns SET status='failed',error_code=$2 WHERE id=$1 AND status='pending'",[turnId,errorCode]);
  }

  async message(client:pg.PoolClient, id:string) {
    const {rows}=await client.query<ChatMessageEntity>(`SELECT ${MESSAGE} FROM ai_chat_messages WHERE id=$1`,[id]);
    return rows[0];
  }
}
