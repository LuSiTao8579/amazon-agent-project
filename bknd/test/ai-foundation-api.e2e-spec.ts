import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getDataSourceToken } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DataSource, type QueryRunner } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/setup-app.js';
import { PG_POOL } from '../src/database/database.module.js';
import { UsersService } from '../src/users/users.service.js';
import { AI_DATA_SOURCE } from '../src/ai/ai.constants.js';
import { AiAuditService } from '../src/ai/services/ai-audit.service.js';
import { AiOperationAuditEntity } from '../src/ai/entities/ai-operation-audit.entity.js';

const uuid = randomUUID();

describe('AI 基础数据 HTTP API 与 JWT (真实 PostgreSQL)', () => {
  let bootstrap: TestingModule;
  let app: INestApplication<App>;
  let pool: pg.Pool;
  let auditRunner: QueryRunner;
  let auditService: AiAuditService;
  let userA: string;
  let userB: string;
  let admin: string;
  let tokenA: string;
  let tokenB: string;
  let adminToken: string;
  let auditA: string;
  let auditB: string;
  const users: string[] = [];

  beforeAll(async () => {
    // 审计表禁止删除，用真实事务中的 Repository 注入 HTTP 应用，
    // 让请求走真实 Service 和数据库，同时测试结束可以回滚所有审计记录。
    bootstrap = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await bootstrap.init();
    const dataSource = bootstrap.get<DataSource>(getDataSourceToken(AI_DATA_SOURCE));
    auditRunner = dataSource.createQueryRunner();
    await auditRunner.connect();
    await auditRunner.startTransaction();
    auditService = new AiAuditService(auditRunner.manager.getRepository(AiOperationAuditEntity), bootstrap.get(UsersService));

    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AiAuditService).useValue(auditService).compile();
    app = fixture.createNestApplication<App>();
    setupApp(app);
    await app.init();
    pool = app.get(PG_POOL);
    for (const isAdmin of [false, false, true]) {
      const { rows } = await pool.query<{ id: string }>(
        'INSERT INTO users(email,password_hash,is_admin) VALUES ($1,$2,$3) RETURNING id',
        [`ai-api-${randomUUID()}@example.test`, '$argon2id$fixture', isAdmin],
      );
      users.push(rows[0].id);
    }
    [userA, userB, admin] = users;
    const jwt = app.get(JwtService);
    tokenA = await jwt.signAsync({ sub: userA });
    tokenB = await jwt.signAsync({ sub: userB });
    adminToken = await jwt.signAsync({ sub: admin });
    auditA = (await auditService.create(userA, { action: 'task.create', resourceType: 'task', result: 'success' })).id;
    auditB = (await auditService.create(userB, { action: 'task.read', resourceType: 'task', result: 'failure' })).id;
  });

  afterAll(async () => {
    try {
      if (auditRunner?.isTransactionActive) await auditRunner.rollbackTransaction();
      if (auditRunner && !auditRunner.isReleased) await auditRunner.release();
      if (pool && users.length) {
        await pool.query('DELETE FROM ai_chat_session WHERE id IN (SELECT id FROM ai_chat_sessions WHERE user_id=ANY($1::uuid[]))', [users]);
        await pool.query('DELETE FROM ai_chat_attachments WHERE message_id IN (SELECT m.id FROM ai_chat_messages m JOIN ai_chat_sessions s ON s.id=m.session_id WHERE s.user_id=ANY($1::uuid[]))', [users]);
        await pool.query('DELETE FROM ai_chat_turns WHERE session_id IN (SELECT id FROM ai_chat_sessions WHERE user_id=ANY($1::uuid[]))', [users]);
        await pool.query('DELETE FROM ai_chat_messages WHERE session_id IN (SELECT id FROM ai_chat_sessions WHERE user_id=ANY($1::uuid[]))', [users]);
        await pool.query('DELETE FROM ai_chat_sessions WHERE user_id=ANY($1::uuid[])', [users]);
        await pool.query('DELETE FROM ai_user_memory WHERE user_id=ANY($1::uuid[])', [users]);
        await pool.query('DELETE FROM ai_task_record WHERE user_id=ANY($1::uuid[])', [users]);
        await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [users]);
      }
    } finally {
      await app?.close();
      await bootstrap?.close();
    }
  });

  it('所有已定义的接口均拒绝未登录或无效 JWT', async () => {
    const server = app.getHttpServer();
    const calls = [
      () => request(server).post('/ai/sessions'), () => request(server).get('/ai/sessions'),
      () => request(server).get(`/ai/sessions/${uuid}`), () => request(server).patch(`/ai/sessions/${uuid}`),
      () => request(server).delete(`/ai/sessions/${uuid}`),
      () => request(server).post('/ai/memories'), () => request(server).get('/ai/memories'),
      () => request(server).get(`/ai/memories/${uuid}`), () => request(server).patch(`/ai/memories/${uuid}`),
      () => request(server).delete(`/ai/memories/${uuid}`),
      () => request(server).post('/ai/tasks'), () => request(server).get('/ai/tasks'),
      () => request(server).get(`/ai/tasks/${uuid}`), () => request(server).patch(`/ai/tasks/${uuid}`),
      () => request(server).delete(`/ai/tasks/${uuid}`),
      () => request(server).post('/ai/audits'), () => request(server).get('/ai/audits'),
      () => request(server).get(`/ai/audits/${uuid}`),
      () => request(server).get('/ai/admin/audits'), () => request(server).get(`/ai/admin/audits/${uuid}`),
    ];
    for (const call of calls) {
      const response = await call().expect(401);
      expect(response.body).toMatchObject({ statusCode: 401 });
    }
    await request(server).get('/ai/memories').auth('not-a-jwt', { type: 'bearer' }).expect(401);
  });

  it('会话 HTTP CRUD 复用旧聊天，按用户隔离并支持分页和状态筛选', async () => {
    const server = app.getHttpServer();
    await request(server).post('/ai/sessions').auth(tokenA, { type: 'bearer' }).send({ title: '越权', userId: userB }).expect(400);
    await request(server).get(`/ai/sessions?userId=${userB}`).auth(tokenA, { type: 'bearer' }).expect(400);
    const created = await request(server).post('/ai/sessions').auth(tokenA, { type: 'bearer' })
      .send({ title: ' 新会话 ' }).expect(201).expect('Cache-Control', 'no-store');
    expect(created.body).toMatchObject({ userId: userA, title: '新会话', status: 'active' });
    const id = created.body.id as string;
    expect((await pool.query('SELECT id FROM ai_chat_session WHERE id=$1', [id])).rowCount).toBe(1);
    await request(server).get(`/ai-agent/sessions/${id}`).auth(tokenA, { type: 'bearer' }).expect(200);
    const legacy = await request(server).post('/ai-agent/sessions').auth(tokenA, { type: 'bearer' })
      .send({ title: '旧接口会话' }).expect(201);
    const legacyId = legacy.body.id as string;
    await request(server).get(`/ai/sessions/${legacyId}`).auth(tokenA, { type: 'bearer' }).expect(200)
      .expect((res) => { expect(res.body).toMatchObject({ title: '旧接口会话', status: 'active' }); });
    await request(server).patch(`/ai/sessions/${legacyId}`).auth(tokenA, { type: 'bearer' }).send({ status: 'closed' }).expect(200);
    await request(server).post('/ai/sessions').auth(tokenA, { type: 'bearer' }).send({}).expect(201);
    const page = await request(server).get('/ai/sessions?page=1&pageSize=1').auth(tokenA, { type: 'bearer' }).expect(200);
    expect(page.body).toMatchObject({ page: 1, pageSize: 1, hasMore: true });
    const bPage = await request(server).get('/ai/sessions').auth(tokenB, { type: 'bearer' }).expect(200);
    expect(bPage.body.items).toEqual([]);
    await request(server).get(`/ai/sessions/${id}`).auth(tokenB, { type: 'bearer' }).expect(404);
    await request(server).get(`/ai/sessions/${id}`).auth(adminToken, { type: 'bearer' }).expect(404);
    await request(server).patch(`/ai/sessions/${id}`).auth(tokenB, { type: 'bearer' }).send({ status: 'closed' }).expect(404);
    await request(server).delete(`/ai/sessions/${id}`).auth(tokenB, { type: 'bearer' }).expect(404);
    await request(server).patch(`/ai/sessions/${id}`).auth(tokenA, { type: 'bearer' }).send({ status: 'closed' }).expect(200);
    const closed = await request(server).get('/ai/sessions?status=closed').auth(tokenA, { type: 'bearer' }).expect(200);
    expect(closed.body.items.map((row: { id: string }) => row.id)).toContain(id);
    await request(server).delete(`/ai/sessions/${id}`).auth(tokenA, { type: 'bearer' }).expect(200).expect({ deleted: true });
    await request(server).get(`/ai/sessions/${id}`).auth(tokenA, { type: 'bearer' }).expect(404);
    await request(server).get(`/ai-agent/sessions/${id}`).auth(tokenA, { type: 'bearer' }).expect(404);
    expect((await pool.query('SELECT id FROM ai_chat_session WHERE id=$1', [id])).rowCount).toBe(1);
    expect((await pool.query('SELECT id FROM ai_chat_sessions WHERE id=$1 AND deleted_at IS NOT NULL', [id])).rowCount).toBe(1);
  });

  it('记忆 HTTP CRUD 限定当前用户，不接受伪造归属', async () => {
    const server = app.getHttpServer();
    await request(server).post('/ai/memories').auth(tokenA, { type: 'bearer' })
      .send({ content: '越权', userId: userB }).expect(400);
    await request(server).get(`/ai/memories?userId=${userB}`).auth(tokenA, { type: 'bearer' }).expect(400);
    const created = await request(server).post('/ai/memories').auth(tokenA, { type: 'bearer' })
      .send({ content: '偏好中文' }).expect(201).expect('Cache-Control', 'no-store');
    expect(created.body).toMatchObject({ content: '偏好中文', userId: userA });
    const id = created.body.id as string;
    await request(server).post('/ai/memories').auth(tokenA, { type: 'bearer' }).send({ content: '另一条' }).expect(201);
    const page = await request(server).get('/ai/memories?pageSize=1').auth(tokenA, { type: 'bearer' }).expect(200);
    expect(page.body).toMatchObject({ page: 1, pageSize: 1, hasMore: true });
    await request(server).get(`/ai/memories/${id}`).auth(tokenB, { type: 'bearer' }).expect(404);
    await request(server).get(`/ai/memories/${id}`).auth(adminToken, { type: 'bearer' }).expect(404);
    await request(server).patch(`/ai/memories/${id}`).auth(tokenB, { type: 'bearer' }).send({ content: '越权' }).expect(404);
    await request(server).delete(`/ai/memories/${id}`).auth(tokenB, { type: 'bearer' }).expect(404);
    await request(server).patch(`/ai/memories/${id}`).auth(tokenA, { type: 'bearer' }).send({ content: '已更新' }).expect(200);
    await request(server).get(`/ai/memories/${id}`).auth(tokenA, { type: 'bearer' }).expect(200)
      .expect((res) => { expect(res.body.content).toBe('已更新'); });
    await request(server).delete(`/ai/memories/${id}`).auth(tokenA, { type: 'bearer' }).expect(200).expect({ deleted: true });
    await request(server).get(`/ai/memories/${id}`).auth(tokenA, { type: 'bearer' }).expect(404);
  });

  it('任务 HTTP CRUD 支持状态筛选及用户隔离', async () => {
    const server = app.getHttpServer();
    await request(server).post('/ai/tasks').auth(tokenA, { type: 'bearer' }).send({ name: '越权', userId: userB }).expect(400);
    await request(server).get(`/ai/tasks?userId=${userB}`).auth(tokenA, { type: 'bearer' }).expect(400);
    const created = await request(server).post('/ai/tasks').auth(tokenA, { type: 'bearer' }).send({ name: '任务' }).expect(201);
    expect(created.body).toMatchObject({ userId: userA, name: '任务', status: 'pending' });
    const id = created.body.id as string;
    await request(server).get(`/ai/tasks/${id}`).auth(tokenB, { type: 'bearer' }).expect(404);
    await request(server).get(`/ai/tasks/${id}`).auth(adminToken, { type: 'bearer' }).expect(404);
    await request(server).patch(`/ai/tasks/${id}`).auth(tokenB, { type: 'bearer' }).send({ status: 'running' }).expect(404);
    await request(server).delete(`/ai/tasks/${id}`).auth(tokenB, { type: 'bearer' }).expect(404);
    await request(server).patch(`/ai/tasks/${id}`).auth(tokenA, { type: 'bearer' }).send({ name: '更新', status: 'running' }).expect(200);
    const list = await request(server).get('/ai/tasks?status=running').auth(tokenA, { type: 'bearer' }).expect(200);
    expect(list.body.items.map((row: { id: string }) => row.id)).toContain(id);
    await request(server).get(`/ai/tasks/${id}`).auth(tokenA, { type: 'bearer' }).expect(200)
      .expect((res) => { expect(res.body).toMatchObject({ name: '更新', status: 'running' }); });
    await request(server).delete(`/ai/tasks/${id}`).auth(tokenA, { type: 'bearer' }).expect(200).expect({ deleted: true });
    await request(server).get(`/ai/tasks/${id}`).auth(tokenA, { type: 'bearer' }).expect(404);
  });

  it('用户可上报本人审计，管理员可查全量；审计不能修改或删除', async () => {
    const server = app.getHttpServer();
    const report = await request(server).post('/ai/audits').auth(tokenA, { type: 'bearer' })
      .send({ action: 'task.open', resourceType: 'task', result: 'success' }).expect(201)
      .expect('Cache-Control', 'no-store');
    expect(report.body).toMatchObject({ userId: userA, action: 'client.task.open', result: 'success' });
    await request(server).get(`/ai/audits/${report.body.id as string}`).auth(tokenB, { type: 'bearer' }).expect(404);
    await request(server).post('/ai/audits').auth(tokenA, { type: 'bearer' })
      .send({ action: 'task.open', resourceType: 'task', result: 'success', userId: userB }).expect(400);
    await request(server).post('/ai/audits').auth(tokenA, { type: 'bearer' })
      .send({ action: 'a'.repeat(94), resourceType: 'task', result: 'success' }).expect(400);
    await request(server).post('/ai/audits').auth(tokenA, { type: 'bearer' })
      .send({ action: 'task.open', resourceType: 'task' }).expect(400);
    await request(server).post('/ai/audits').auth(tokenA, { type: 'bearer' })
      .send({ action: 'task.open', result: 'success' }).expect(400);
    await request(server).post('/ai/audits').auth(tokenA, { type: 'bearer' })
      .send({ action: 'task.open', resourceType: 'task', result: 'invalid' }).expect(400);
    const longest = await request(server).post('/ai/audits').auth(tokenA, { type: 'bearer' })
      .send({ action: 'a'.repeat(93), resourceType: 'task', result: 'success' }).expect(201);
    expect(longest.body.action).toHaveLength(100);
    const mine = await request(server).get('/ai/audits').auth(tokenA, { type: 'bearer' }).expect(200);
    expect(mine.body.items.map((row: { id: string }) => row.id)).toContain(auditA);
    expect(mine.body.items.map((row: { id: string }) => row.id)).not.toContain(auditB);
    await request(server).get(`/ai/audits/${auditA}`).auth(tokenA, { type: 'bearer' }).expect(200);
    await request(server).get(`/ai/audits/${auditB}`).auth(tokenA, { type: 'bearer' }).expect(404);
    await request(server).get(`/ai/audits?userId=${userB}`).auth(tokenA, { type: 'bearer' }).expect(400);
    await request(server).get('/ai/admin/audits').auth(tokenA, { type: 'bearer' }).expect(403);
    await request(server).get(`/ai/admin/audits/${auditB}`).auth(tokenA, { type: 'bearer' }).expect(403);
    const from = new Date(Date.now() - 60000).toISOString();
    const to = new Date(Date.now() + 60000).toISOString();
    const all = await request(server).get('/ai/admin/audits').auth(adminToken, { type: 'bearer' })
      .query({ pageSize: 100, from, to }).expect(200);
    expect(all.body.items.map((row: { id: string }) => row.id)).toEqual(expect.arrayContaining([auditA, auditB, report.body.id]));
    const filtered = await request(server).get('/ai/admin/audits').auth(adminToken, { type: 'bearer' })
      .query({ userId: userB, result: 'failure', from, to }).expect(200);
    expect(filtered.body.items.map((row: { id: string }) => row.id)).toEqual([auditB]);
    await request(server).get(`/ai/admin/audits/${auditB}`).auth(adminToken, { type: 'bearer' }).expect(200);
    for (const actor of [tokenA, adminToken]) {
      await request(server).patch(`/ai/audits/${auditA}`).auth(actor, { type: 'bearer' }).send({}).expect(404);
      await request(server).delete(`/ai/audits/${auditA}`).auth(actor, { type: 'bearer' }).expect(404);
      await request(server).post('/ai/admin/audits').auth(actor, { type: 'bearer' }).send({}).expect(404);
      await request(server).patch(`/ai/admin/audits/${auditA}`).auth(actor, { type: 'bearer' }).send({}).expect(404);
      await request(server).delete(`/ai/admin/audits/${auditA}`).auth(actor, { type: 'bearer' }).expect(404);
    }
  });

  it('参数错误返回 400，不泄漏提交值；账号停用和管理员撤权立即生效', async () => {
    const server = app.getHttpServer();
    const invalid = await request(server).post('/ai/memories').auth(tokenA, { type: 'bearer' })
      .send({ content: '   ' }).expect(400);
    expect(invalid.body).toMatchObject({ statusCode: 400 });
    expect(invalid.body.message).toContain('content 不能为空白');
    expect(JSON.stringify(invalid.body)).not.toContain('password');
    await request(server).post('/ai/sessions').auth(tokenA, { type: 'bearer' }).send([]).expect(400);
    await request(server).post('/ai/tasks').auth(tokenA, { type: 'bearer' }).send({ name: '' }).expect(400);
    await request(server).get('/ai/tasks?pageSize=101').auth(tokenA, { type: 'bearer' }).expect(400);
    await request(server).get('/ai/tasks/not-a-uuid').auth(tokenA, { type: 'bearer' }).expect(400);
    await request(server).get('/ai/admin/audits?userId=invalid').auth(adminToken, { type: 'bearer' }).expect(400);
    await request(server).get('/ai/audits?from=2026-02-30T10%3A00%3A00Z').auth(tokenA, { type: 'bearer' }).expect(400);
    await pool.query("UPDATE users SET status='inactive' WHERE id=$1", [userB]);
    try {
      await request(server).get('/ai/tasks').auth(tokenB, { type: 'bearer' }).expect(401);
    } finally { await pool.query("UPDATE users SET status='active' WHERE id=$1", [userB]); }
    await pool.query('UPDATE users SET is_admin=false WHERE id=$1', [admin]);
    try {
      await request(server).get('/ai/admin/audits').auth(adminToken, { type: 'bearer' }).expect(403);
    } finally { await pool.query('UPDATE users SET is_admin=true WHERE id=$1', [admin]); }
  });

  it('Swagger 描述真实路径、鉴权、请求和响应，不暴露审计修改或删除接口', async () => {
    const response = await request(app.getHttpServer()).get('/docs-json').expect(200);
    const doc = response.body;
    for (const path of ['/ai/sessions', '/ai/memories', '/ai/tasks', '/ai/audits', '/ai/admin/audits']) {
      expect(doc.paths[path].get.security).toEqual([{ bearer: [] }]);
    }
    expect(Object.keys(doc.paths['/ai/audits']).sort()).toEqual(['get', 'post']);
    expect(doc.paths['/ai/audits'].post.security).toEqual([{ bearer: [] }]);
    expect(doc.paths['/ai/audits'].post.requestBody.content['application/json'].schema.$ref).toContain('CreateAiAuditReportDto');
    expect(doc.components.schemas.CreateAiAuditReportDto.properties).not.toHaveProperty('userId');
    expect(Object.keys(doc.paths['/ai/admin/audits'])).toEqual(['get']);
    expect(Object.keys(doc.paths['/ai/audits/{id}'])).toEqual(['get']);
    expect(Object.keys(doc.paths['/ai/admin/audits/{id}'])).toEqual(['get']);
    expect(doc.paths['/ai/memories'].post.requestBody.content['application/json'].schema.$ref).toContain('CreateAiMemoryDto');
    expect(doc.components.schemas.CreateAiMemoryDto.properties).not.toHaveProperty('userId');
    expect(doc.components.schemas.AiMemoryPageResponseDto.properties).toHaveProperty('items');
    expect(doc.components.schemas.AiMemoryPageResponseDto.properties).toHaveProperty('hasMore');
    expect(doc.paths['/ai/admin/audits'].get.parameters.map((p: { name: string }) => p.name)).toContain('userId');
    expect(doc.paths['/ai/audits'].get.parameters.map((p: { name: string }) => p.name)).not.toContain('userId');
  });
});
