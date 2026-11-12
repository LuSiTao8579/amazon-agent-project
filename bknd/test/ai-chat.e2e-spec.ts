import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { AppModule } from '../src/app.module.js';
import { PG_POOL } from '../src/database/database.module.js';
import { PasswordHasher } from '../src/users/password-hasher.service.js';
import { UsersService } from '../src/users/users.service.js';
import { ChatRepository } from '../src/ai-agent/chat.repository.js';

describe('聊天数据结构 (真实 PostgreSQL)', () => {
  let moduleRef: TestingModule;
  let pool: pg.Pool;
  let repo: ChatRepository;
  let firstUser: string;
  let secondUser: string;
  const emails = [`chat-a-${randomUUID()}@example.test`, `chat-b-${randomUUID()}@example.test`];
  const sessionIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.init();
    pool = moduleRef.get(PG_POOL);
    repo = new ChatRepository(pool);
    const hash = await moduleRef.get(PasswordHasher).hash('chat-fixture-password');
    const users = moduleRef.get(UsersService);
    firstUser = (await users.create({ email: emails[0], passwordHash: hash })).id;
    secondUser = (await users.create({ email: emails[1], passwordHash: hash })).id;
  });

  afterAll(async () => {
    try {
      // 只删除本次测试创建的记录，并按外键依赖顺序清理。
      if (pool) {
        await pool.query('DELETE FROM ai_chat_attachments WHERE message_id IN (SELECT id FROM ai_chat_messages WHERE session_id = ANY($1::uuid[]))', [sessionIds]);
        await pool.query('DELETE FROM ai_chat_messages WHERE session_id = ANY($1::uuid[])', [sessionIds]);
        await pool.query('DELETE FROM ai_chat_sessions WHERE id = ANY($1::uuid[])', [sessionIds]);
        await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [emails]);
      }
    } finally { await moduleRef?.close(); }
  });

  it('一个用户有多个会话，会话中的消息按插入顺序保存并可重新读取', async () => {
    const a = await repo.createSession(firstUser, '第一个会话');
    const b = await repo.createSession(firstUser, '第二个会话');
    sessionIds.push(a.id, b.id);
    const one = await repo.addMessage(firstUser, a.id, 'user', 'text', { text: '你好' });
    const two = await repo.addMessage(firstUser, a.id, 'assistant', 'text', { text: '你好，有什么可以帮忙？' });
    expect(one).not.toBeNull();
    expect(two).not.toBeNull();
    const ids = (await repo.listSessions(firstUser)).map(s => s.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    const messages = await new ChatRepository(pool).listMessages(firstUser, a.id);
    expect(messages.map(m => m.content)).toEqual([{ text: '你好' }, { text: '你好，有什么可以帮忙？' }]);
    expect(await repo.listMessages(firstUser, b.id)).toEqual([]);
    const attachment = await pool.query(
      'INSERT INTO ai_chat_attachments(message_id,original_name,media_type,byte_size,storage_key) VALUES ($1,$2,$3,$4,$5) RETURNING original_name',
      [one!.id, 'example.csv', 'text/csv', 10, `fixture-${randomUUID()}`],
    );
    expect(attachment.rows[0].original_name).toBe('example.csv');
  });

  it('另一个用户不能读取会话或插入消息', async () => {
    const session = await repo.createSession(firstUser, '私人会话');
    sessionIds.push(session.id);
    await repo.addMessage(firstUser, session.id, 'user', 'text', { text: '私有内容' });
    expect(await repo.getSession(secondUser, session.id)).toBeNull();
    expect((await repo.listSessions(secondUser)).some(s => s.id === session.id)).toBe(false);
    expect(await repo.listMessages(secondUser, session.id)).toEqual([]);
    expect(await repo.addMessage(secondUser, session.id, 'user', 'text', { text: '越权内容' })).toBeNull();
    expect(await repo.listMessages(firstUser, session.id)).toHaveLength(1);
  });

  it('数据库拒绝不存在的用户、无效角色和悬空附件', async () => {
    await expect(repo.createSession(randomUUID())).rejects.toMatchObject({ code: '23503' });
    const session = await repo.createSession(firstUser);
    sessionIds.push(session.id);
    await expect(pool.query(
      "INSERT INTO ai_chat_messages(session_id,role,content) VALUES($1,'invalid','{}'::jsonb)", [session.id],
    )).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query(
      'INSERT INTO ai_chat_attachments(message_id,original_name,media_type,byte_size,storage_key) VALUES($1,$2,$3,$4,$5)',
      [randomUUID(), 'example.txt', 'text/plain', 1, randomUUID()],
    )).rejects.toMatchObject({ code: '23503' });
  });
});
