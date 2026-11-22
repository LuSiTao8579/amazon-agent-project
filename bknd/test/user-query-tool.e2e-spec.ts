import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import request from 'supertest';
import type { DataSource, QueryRunner } from 'typeorm';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/setup-app.js';
import { PG_POOL } from '../src/database/database.module.js';
import { ModelService } from '../src/ai-agent/providers/model.service.js';
import type { ChatModel } from '../src/ai-agent/providers/chat-model.types.js';
import { toolDefinitions } from '../src/ai-agent/providers/chat-tools.js';
import { AI_DATA_SOURCE } from '../src/ai/ai.constants.js';
import { AiAuditService } from '../src/ai/services/ai-audit.service.js';
import { AiOperationAuditEntity } from '../src/ai/entities/ai-operation-audit.entity.js';
import { AiSessionContextCache } from '../src/ai/cache/ai-session-context.cache.js';
import { ToolRegistryService } from '../src/ai/tools/tool-registry.service.js';
import { UsersService } from '../src/users/users.service.js';
import { UserManagementService } from '../src/users/user-management.service.js';
import { UserListDto } from '../src/users/user-management.dto.js';
import type { PublicUser } from '../src/users/user.types.js';

describe('聊天用户查询与管理列表', () => {
  const search = 'step8-' + randomUUID();
  const actors = { admin: randomUUID(), member: randomUUID(), manager: randomUUID() };
  type Actor = keyof typeof actors;
  const ids = Object.values(actors);
  const tokens = new Map<Actor, string>();
  const sessions = new Map<Actor, string>();
  const args = { search, roles: ['Analyst', 'Manager'], status: 'inactive', sortBy: 'name', sortOrder: 'desc', pageSize: 2 };
  const chat = vi.fn<ChatModel['chat']>();
  let db: pg.Pool;
  let app: INestApplication;
  let audit: QueryRunner;

  async function add(id: string, name: string, role: string, status: string, isAdmin = false) {
    await db.query(`INSERT INTO users(id,email,password_hash,name,role,status,is_admin) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, id + '@example.test', '$argon2id$fixture', name, role, status, isAdmin]);
  }
  function run(actor: Actor, text: string, requestId = randomUUID()) {
    return request(app.getHttpServer()).post('/ai-agent/sessions/' + sessions.get(actor) + '/turns')
      .auth(tokens.get(actor)!, { type: 'bearer' }).send({ requestId, text }).expect(201);
  }
  function propose(businessArgs: Record<string, unknown>) {
    chat.mockImplementationOnce(async (_messages, names) => {
      expect(names).toEqual(['query_users']);
      expect(toolDefinitions(names!)[0].function.parameters.properties).toMatchObject({
        status: { enum: ['active', 'inactive'] }, roles: { items: { enum: ['Member', 'Manager', 'Analyst'] } },
      });
      return { tool: 'query_users', args: businessArgs };
    });
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ModelService).useValue({ chat })
      .overrideProvider(AiAuditService).useFactory({
        inject: [getDataSourceToken(AI_DATA_SOURCE), UsersService],
        factory: async (source: DataSource, users: UsersService) => {
          audit = source.createQueryRunner();
          await audit.startTransaction();
          return new AiAuditService(audit.manager.getRepository(AiOperationAuditEntity), users);
        },
      }).compile();
    app = mod.createNestApplication();
    setupApp(app);
    await app.init();
    db = app.get(PG_POOL);
    for (const actor of Object.keys(actors) as Actor[]) {
      await add(actors[actor], actor, actor === 'manager' ? 'Manager' : 'Member', 'active', actor === 'admin');
      const token = await app.get(JwtService).signAsync({ sub: actors[actor] });
      tokens.set(actor, token);
      const res = await request(app.getHttpServer()).post('/ai-agent/sessions')
        .auth(token, { type: 'bearer' }).send({}).expect(201);
      sessions.set(actor, res.body.id);
    }
    for (const [name, role, status] of [
      [search + '-A', 'Manager', 'inactive'], [search + '-B', 'Analyst', 'inactive'], [search + '-C', 'Manager', 'inactive'],
      [search + '-D', 'Member', 'inactive'], [search + '-E', 'Analyst', 'active'], ['different', 'Manager', 'inactive'],
    ]) {
      const id = randomUUID();
      ids.push(id);
      await add(id, name, role, status);
    }
  });

  afterAll(async () => {
    try {
      if (audit?.isTransactionActive) await audit.rollbackTransaction();
      if (audit) await audit.release();
      if (db) {
        for (const [actor, session] of sessions) await app.get(AiSessionContextCache).clear(actors[actor], session);
        const sessionIds = [...sessions.values()];
        for (const table of ['ai_chat_turns', 'ai_chat_messages'])
          await db.query(`DELETE FROM ${table} WHERE session_id=ANY($1::uuid[])`, [sessionIds]);
        await db.query('DELETE FROM ai_chat_session WHERE id=ANY($1::uuid[])', [sessionIds]);
        await db.query('DELETE FROM ai_chat_sessions WHERE id=ANY($1::uuid[])', [sessionIds]);
        await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [ids]);
      }
    } finally { await app?.close(); }
  });

  it('组合筛选、降序和分页与 GET /users 对齐，每行严格限制四个字段', async () => {
    for (const [page, suffixes] of [[1, ['C', 'B']], [2, ['A']], [3, []]] as const) {
      const api = await request(app.getHttpServer()).get('/users').auth(tokens.get('admin')!, { type: 'bearer' })
        .query({ ...args, roles: args.roles.join(','), page }).expect(200);
      propose({ ...args, page });
      const { assistantMessage } = (await run('admin', `查姓名含 ${search} 的已停用用户，岗位为 Analyst 或 Manager，按姓名降序，每页 2 人，第 ${page} 页`)).body;
      expect(assistantMessage.messageType).toBe('table');
      const items = api.body.items.map(({ name, email, role, status }: PublicUser) => ({ name, email, role, status }));
      expect(items.map(({ name }: PublicUser) => name)).toEqual(suffixes.map(suffix => search + '-' + suffix));
      expect(api.body.total).toBe(3);
      expect(assistantMessage.content).toMatchObject({ code: 'OK', resultType: 'table' });
      expect(assistantMessage.content.data).toEqual({ tableType: 'users', items, total: 3, page, pageSize: 2 });
    }
    propose({ ...args, status: 'active' });
    expect((await run('admin', '查启用用户')).body.assistantMessage.content.data.items).toEqual([
      expect.objectContaining({ name: search + '-E', status: 'active' }),
    ]);
    propose({ search, roles: args.roles });
    expect((await run('admin', '查用户')).body.assistantMessage.content.data).toMatchObject({ total: 4, page: 1, pageSize: 10 });
  });

  it.each(['member', 'manager'] as const)('%s 由工具入口拒绝，列表调用为零，审计归属本人', async actor => {
    const list = vi.spyOn(app.get(UserManagementService), 'list');
    const execute = vi.spyOn(app.get(ToolRegistryService), 'execute');
    try {
      propose(args);
      const result = (await run(actor, '查用户')).body.assistantMessage.content;
      expect(result).toMatchObject({ code: 'FORBIDDEN', resultType: 'text', data: null, message: expect.stringContaining('权限') });
      await request(app.getHttpServer()).get('/users').auth(tokens.get(actor)!, { type: 'bearer' }).expect(403);
      expect(list).not.toHaveBeenCalled();
      const audits = await request(app.getHttpServer()).get('/ai/audits').auth(tokens.get(actor)!, { type: 'bearer' }).expect(200);
      expect(audits.body.items).toEqual([expect.objectContaining({ userId: actors[actor], toolName: 'query_users',
        action: 'users.read', result: 'failure', resultSummary: { code: 'FORBIDDEN', resultType: 'text' } })]);
      const context = execute.mock.calls[0][1];
      await expect(app.get(UserManagementService).list(new UserListDto(), context)).rejects.toMatchObject({ status: 403 });
    } finally { list.mockRestore(); execute.mockRestore(); }
  });

  it('非法状态在进入 Service 前被拒绝', async () => {
    const list = vi.spyOn(app.get(UserManagementService), 'list');
    try {
      for (const status of ['', null, ['active'], 'paused']) {
        propose({ status });
        expect((await run('admin', '查用户')).body.assistantMessage.content).toMatchObject({ code: 'INVALID_ARGUMENTS', data: null });
      }
      await request(app.getHttpServer()).get('/users').auth(tokens.get('admin')!, { type: 'bearer' })
        .query({ status: 'paused' }).expect(400);
      expect(list).not.toHaveBeenCalled();
    } finally { list.mockRestore(); }
  });

  it('聊天工具拒绝身份覆盖，Service 异常只保留安全提示和脱敏审计', async () => {
    const list = vi.spyOn(app.get(UserManagementService), 'list');
    const privateMessage = 'private fixture: backend query failed';
    const searchInput = 'private-contact@example.test';
    const http = request(app.getHttpServer());
    try {
      propose({ userId: actors.member, isAdmin: true, search: searchInput });
      const rejected = (await run('admin', '查用户')).body.assistantMessage;
      expect(rejected.content).toMatchObject({ code: 'INVALID_ARGUMENTS', data: null, resultType: 'text' });
      expect(list).not.toHaveBeenCalled();

      propose({ search: searchInput });
      list.mockRejectedValueOnce(new Error(privateMessage));
      const failed = (await run('admin', '查用户')).body.assistantMessage;
      expect(list).toHaveBeenCalledTimes(1);
      expect(failed.content).toMatchObject({ code: 'EXECUTION_FAILED', data: null, resultType: 'text', message: '查询未完成，请稍后重试。' });
      const history = await http.get('/ai-agent/sessions/' + sessions.get('admin') + '/messages')
        .auth(tokens.get('admin')!, { type: 'bearer' }).query({ cursor: 'latest', pageSize: 1 }).expect(200);
      expect(history.body.items[0].content).toEqual(failed.content);

      const audits = await http.get('/ai/audits').auth(tokens.get('admin')!, { type: 'bearer' })
        .query({ result: 'failure' }).expect(200);
      const items = audits.body.items as AiOperationAuditEntity[];
      expect(items).toEqual(expect.arrayContaining([
        expect.objectContaining({ userId: actors.admin, toolName: 'query_users', inputParams: { userId: '[REDACTED]', isAdmin: true, search: '[REDACTED]' },
          resultSummary: { code: 'INVALID_ARGUMENTS', resultType: 'text' } }),
        expect.objectContaining({ userId: actors.admin, toolName: 'query_users', inputParams: { search: '[REDACTED]' },
          resultSummary: { code: 'EXECUTION_FAILED', resultType: 'text' } }),
      ]));
      const exposed = JSON.stringify([rejected.content, failed.content, history.body, items]);
      expect(exposed).not.toContain(searchInput);
      expect(exposed).not.toContain(privateMessage);
    } finally { list.mockRestore(); }
  });

  it('撤权后直接调用、读取历史和重放均无法取得用户行', async () => {
    const service = app.get(UserManagementService);
    const dto = new UserListDto();
    await expect(service.list(dto, undefined)).rejects.toMatchObject({ status: 401 });
    await expect(service.list(dto, { userId: actors.admin, ip: '127.0.0.1', isAdmin: true })).rejects.toMatchObject({ status: 401 });
    const list = vi.spyOn(service, 'list');
    const requestId = randomUUID();
    try {
      propose(args);
      const first = (await run('admin', '查用户', requestId)).body.assistantMessage;
      expect(first.content.data.items).toHaveLength(2);
      const issued = list.mock.calls[0][1];
      // 此用例与审计事务并行；更新非键字段允许保留已有用户外键引用。
      await db.query('UPDATE users SET is_admin=false WHERE id=$1', [actors.admin]);
      await expect(service.list(dto, issued)).rejects.toMatchObject({ status: 403 });
      list.mockClear();
      const repeat = (await run('admin', '查用户', requestId)).body.assistantMessage;
      expect(repeat).toMatchObject({ id: first.id, messageType: 'text', content: { code: 'FORBIDDEN', data: null } });
      const url = '/ai-agent/sessions/' + sessions.get('admin') + '/messages';
      const history = await request(app.getHttpServer()).get(url).auth(tokens.get('admin')!, { type: 'bearer' }).query({ cursor: 'latest' }).expect(200);
      expect(history.body.items[0].content).toEqual(repeat.content);
      expect(list).not.toHaveBeenCalled();
    } finally {
      list.mockRestore();
      await db.query('UPDATE users SET is_admin=true WHERE id=$1', [actors.admin]);
    }
  });
});
