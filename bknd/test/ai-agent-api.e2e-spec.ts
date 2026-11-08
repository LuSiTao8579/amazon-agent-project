import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/setup-app.js';
import { PG_POOL } from '../src/database/database.module.js';
import { UsersService } from '../src/users/users.service.js';
import { PasswordHasher } from '../src/users/password-hasher.service.js';
import { ChatRepository } from '../src/ai-agent/chat.repository.js';

describe('AI会话 API (真实 PostgreSQL)', () => {
  let app: INestApplication<App>;
  let pool: pg.Pool;
  let firstToken: string;
  let secondToken: string;
  let firstUserId: string;
  const emails = [`ai-api-a-${randomUUID()}@example.test`, `ai-api-b-${randomUUID()}@example.test`];
  const sessionIds: string[] = [];

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
    pool = app.get(PG_POOL);
    const users = app.get(UsersService);
    const passwordHash = await app.get(PasswordHasher).hash('ai-api-fixture-password');
    const first = await users.create({ email: emails[0], passwordHash });
    const second = await users.create({ email: emails[1], passwordHash });
    firstUserId = first.id;
    firstToken = await app.get(JwtService).signAsync({ sub: first.id });
    secondToken = await app.get(JwtService).signAsync({ sub: second.id });
  });

  afterAll(async () => {
    try {
      // 仅清除本次测试独有的数据，顺序遵循数据库外键。
      if (pool) {
        await pool.query('DELETE FROM ai_chat_attachments WHERE message_id IN (SELECT id FROM ai_chat_messages WHERE session_id = ANY($1::uuid[]))', [sessionIds]);
        await pool.query('DELETE FROM ai_chat_messages WHERE session_id = ANY($1::uuid[])', [sessionIds]);
        await pool.query('DELETE FROM ai_chat_sessions WHERE id = ANY($1::uuid[])', [sessionIds]);
        await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [emails]);
      }
    } finally { await app?.close(); }
  });

  it('所有接口要求登录，Swagger列出路径和认证要求', async () => {
    const server = app.getHttpServer();
    const missing = randomUUID();
    await request(server).get('/ai-agent/sessions').expect(401);
    await request(server).post('/ai-agent/sessions').send({}).expect(401);
    await request(server).get(`/ai-agent/sessions/${missing}/messages`).expect(401);
    await request(server).post(`/ai-agent/sessions/${missing}/messages`).send({text:'测试'}).expect(401);
    const docs = await request(server).get('/docs-json').expect(200);
    expect(docs.body.paths['/ai-agent/sessions'].post.security).toBeDefined();
    expect(docs.body.paths['/ai-agent/sessions/{id}/messages'].get).toBeDefined();
    expect(docs.body.paths['/ai-agent/sessions/{id}/attachments'].post.requestBody.content['multipart/form-data']).toBeDefined();
  });

  it('创建多个会话、写入用户消息并读取模拟AI消息', async () => {
    const server = app.getHttpServer();
    const first = await request(server).post('/ai-agent/sessions').auth(firstToken, {type:'bearer'}).send({title:'  供应链问题  '}).expect(201);
    sessionIds.push(first.body.id);
    expect(first.body.title).toBe('供应链问题');
    expect(first.body.userId).toBe(firstUserId);
    expect(first.headers['cache-control']).toBe('no-store');
    const second = await request(server).post('/ai-agent/sessions').auth(firstToken, {type:'bearer'}).send({}).expect(201);
    sessionIds.push(second.body.id);
    expect(second.body.title).toBe('新会话');

    const sent = await request(server).post(`/ai-agent/sessions/${first.body.id}/messages`)
      .auth(firstToken, {type:'bearer'}).send({text:'  你好\n第二行  '}).expect(201);
    expect(sent.body).toMatchObject({ role:'user', messageType:'text', content:{text:'  你好\n第二行  '} });
    const repo = app.get(ChatRepository);
    await repo.addMessage(firstUserId, first.body.id, 'assistant', 'text', {text:'这是测试用模拟回复'});
    const firstPage = await request(server).get(`/ai-agent/sessions/${first.body.id}/messages?page=1&pageSize=1`).auth(firstToken, {type:'bearer'}).expect(200);
    expect(firstPage.body).toMatchObject({page:1,pageSize:1,hasMore:true});
    expect(firstPage.body.items[0].role).toBe('user');
    const secondPage = await request(server).get(`/ai-agent/sessions/${first.body.id}/messages?page=2&pageSize=1`).auth(firstToken, {type:'bearer'}).expect(200);
    expect(secondPage.body).toMatchObject({page:2,pageSize:1,hasMore:false});
    expect(secondPage.body.items[0]).toMatchObject({role:'assistant',content:{text:'这是测试用模拟回复'}});
    const sessions = await request(server).get('/ai-agent/sessions?page=1&pageSize=1').auth(firstToken, {type:'bearer'}).expect(200);
    expect(sessions.body).toMatchObject({page:1,pageSize:1,hasMore:true});
    const page2 = await request(server).get('/ai-agent/sessions?page=2&pageSize=1').auth(firstToken, {type:'bearer'}).expect(200);
    expect(new Set([sessions.body.items[0].id,page2.body.items[0].id])).toEqual(new Set(sessionIds));
  });

  it('隔离不同用户并对不存在和他人会话统一返回404', async () => {
    const server = app.getHttpServer();
    const id = sessionIds[0];
    const others = await request(server).get('/ai-agent/sessions').auth(secondToken, {type:'bearer'}).expect(200);
    expect(others.body.items).toEqual([]);
    await request(server).get(`/ai-agent/sessions/${id}/messages`).auth(secondToken, {type:'bearer'}).expect(404);
    await request(server).post(`/ai-agent/sessions/${id}/messages`).auth(secondToken, {type:'bearer'}).send({text:'越权'}).expect(404);
    await request(server).get(`/ai-agent/sessions/${randomUUID()}/messages`).auth(firstToken, {type:'bearer'}).expect(404);
    const history = await request(server).get(`/ai-agent/sessions/${id}/messages`).auth(firstToken, {type:'bearer'}).expect(200);
    expect(history.body.items).toHaveLength(2);
  });

  it('拒绝非法参数与伪造AI消息', async () => {
    const server = app.getHttpServer();
    const target = `/ai-agent/sessions/${sessionIds[0]}/messages`;
    await request(server).post('/ai-agent/sessions').auth(firstToken, {type:'bearer'}).send({title:'   '}).expect(400);
    await request(server).post('/ai-agent/sessions').auth(firstToken, {type:'bearer'}).send({title:null}).expect(400);
    await request(server).post('/ai-agent/sessions').auth(firstToken, {type:'bearer'}).send({userId:randomUUID()}).expect(400);
    await request(server).get('/ai-agent/sessions?page=0').auth(firstToken, {type:'bearer'}).expect(400);
    await request(server).get('/ai-agent/sessions?pageSize=101').auth(firstToken, {type:'bearer'}).expect(400);
    await request(server).get('/ai-agent/sessions/not-a-uuid/messages').auth(firstToken, {type:'bearer'}).expect(400);
    await request(server).post(target).auth(firstToken, {type:'bearer'}).send({text:'   '}).expect(400);
    await request(server).post(target).auth(firstToken, {type:'bearer'}).send({text:'x'.repeat(8001)}).expect(400);
    await request(server).post(target).auth(firstToken, {type:'bearer'}).send({text:'hello',role:'assistant'}).expect(400);
  });
  it('附件上传与下载检查会话归属、大小和格式，并在历史中恢复', async () => {
    const server = app.getHttpServer();
    const id = sessionIds[0];
    const path = `/ai-agent/sessions/${id}/attachments`;
    const contents = Buffer.from('company,revenue\nExample,42\n');
    await request(server).post(path).attach('file', contents, 'sample.csv').expect(401);
    await request(server).post(path).auth(secondToken, {type:'bearer'}).attach('file', contents, 'sample.csv').expect(404);
    await request(server).post(path).auth(firstToken, {type:'bearer'}).attach('file', contents, 'sample.exe').expect(400);
    await request(server).post(path).auth(firstToken, {type:'bearer'}).attach('file', Buffer.from('bad'), 'sample.pdf').expect(400);
    await request(server).post(path).auth(firstToken, {type:'bearer'}).attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), 'large.txt').expect(413);
    const uploaded = await request(server).post(path).auth(firstToken, {type:'bearer'}).attach('file', contents, 'sample.csv').expect(201);
    expect(uploaded.body.attachment.name).toBe('sample.csv');
    expect(JSON.stringify(uploaded.body)).not.toContain('storage_key');
    const attachment = uploaded.body.attachment.id as string;
    const history = await request(server).get(`/ai-agent/sessions/${id}/messages`).auth(firstToken, {type:'bearer'}).expect(200);
    expect(history.body.items.at(-1).attachments[0]).toMatchObject({ id: attachment, name: 'sample.csv' });
    await request(server).get(`${path}/${attachment}`).auth(secondToken, {type:'bearer'}).expect(404);
    const download = await request(server).get(`${path}/${attachment}`).auth(firstToken, {type:'bearer'}).expect(200);
    expect(download.headers['content-disposition']).toContain('attachment');
    expect(download.body).toEqual(contents);
  });

});
