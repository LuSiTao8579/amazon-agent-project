import { Inject, type INestApplication } from '@nestjs/common';
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
import { toolDefinitions, type ChatToolName } from '../src/ai-agent/providers/chat-tools.js';
import { AI_DATA_SOURCE } from '../src/ai/ai.constants.js';
import { AiAuditService } from '../src/ai/services/ai-audit.service.js';
import { AiOperationAuditEntity } from '../src/ai/entities/ai-operation-audit.entity.js';
import { AiCacheService } from '../src/ai/cache/ai-cache.service.js';
import { CompaniesModule } from '../src/companies/companies.module.js';
import { CompaniesService } from '../src/companies/companies.service.js';
import { AiSessionContextCache } from '../src/ai/cache/ai-session-context.cache.js';
import { ToolRegistryService } from '../src/ai/tools/tool-registry.service.js';
import { UsersService } from '../src/users/users.service.js';
import { UserManagementService } from '../src/users/user-management.service.js';
import { UserListDto } from '../src/users/user-management.dto.js';
import type { PublicUser } from '../src/users/user.types.js';

import { PickType } from '@nestjs/swagger';
import { CreateCompanyDto } from '../src/companies/company.dto.js';
import { BaseWriteTool, executionClosed, rollbackUnsupported } from '../src/ai/tools/write/base-write-tool.js';
import { WriteTool } from '../src/ai/tools/write/write-tool.decorator.js';
import type { ToolContext } from '../src/jwt-auth.guard.js';

class LevelChange extends PickType(CreateCompanyDto, ['companyCode', 'level'] as const) {}
@WriteTool({ name: 'testCompanyLevel', target: 'company', operation: 'update' })
class TestLevelTool extends BaseWriteTool<LevelChange> {
  readonly inputDto = LevelChange;
  readonly execute = executionClosed;
  readonly rollback = rollbackUnsupported;
  constructor(@Inject(CompaniesService) private readonly companies: CompaniesService) { super(); }
  protected async validate(_actor: ToolContext, input: LevelChange) { await this.companies.get(input.companyCode); }
  protected getPreview() { return ['level'] as const; }
}

describe('三类只读工具与业务 HTTP 接口对照', () => {
  const search = 'step8-' + randomUUID();
  const country = 'fixture-' + randomUUID();
  const companyCodes = ['A', 'B', 'C'].map(suffix => country + suffix);
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

  function businessGet(actor: Actor, path: string) {
    return request(app.getHttpServer()).get(path).auth(tokens.get(actor)!, { type: 'bearer' });
  }

  async function auditItems(actor: Actor): Promise<AiOperationAuditEntity[]> {
    const response = await businessGet(actor, '/ai/audits').query({ pageSize: 100 }).expect(200);
    return response.body.items;
  }

  async function checkedTurn(actor: Actor, text: string, tool: ChatToolName, input: Record<string, unknown>,
    code: 'OK' | 'INVALID_ARGUMENTS' | 'FORBIDDEN' = 'OK') {
    const before = new Set((await auditItems(actor)).map(row => row.id));
    if (tool === 'query_users') {
      propose(input);
    } else {
      chat.mockImplementationOnce(async (_messages, names) => {
        expect(names).toContain(tool);
        return { tool, args: input };
      });
    }
    const { assistantMessage } = (await run(actor, text)).body;
    expect(assistantMessage.content.code).toBe(code);
    // 事务内多条记录可能具有相同时间戳，按 ID 差集识别本次调用。
    const added = (await auditItems(actor)).filter(row => !before.has(row.id));
    expect(added).toEqual([expect.objectContaining({ userId: actors[actor], toolName: tool,
      result: code === 'OK' ? 'success' : 'failure', resultSummary: expect.objectContaining({ code }) })]);
    return assistantMessage;
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule, CompaniesModule], providers: [TestLevelTool] })
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
    await db.query(`INSERT INTO companies(company_code,company_name,country,city,level,founded_year,annual_revenue,employees)
      VALUES ($1,'Alpha',$4,'London',2,2018,200,2), ($2,'Beta',$4,'London',3,2020,42,0),
             ($3,'Outside',$4,'Leeds',4,2021,900,9)`, [...companyCodes, country]);
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
        await db.query('DELETE FROM companies WHERE company_code=ANY($1::text[])', [companyCodes]);
        await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [ids]);
      }
    } finally { await app?.close(); }
  });

  it('写工具允许受控预览，管理员聊天、只读调度和直接调用均无法提交', async () => {
    const write = app.get(TestLevelTool);
    const registry = app.get(ToolRegistryService);
    const service = app.get(CompaniesService);
    const update = vi.spyOn(service, 'update');
    const dispatch = vi.spyOn(registry, 'execute');
    const enabled = vi.spyOn(app.get(AiCacheService), 'isToolEnabled').mockResolvedValue(true);
    const name = 'testCompanyLevel';
    const args = { companyCode: companyCodes[0], level: 7 };
    try {
      expect(registry.describeWrite(name)).toMatchObject({ kind: 'write', autoExecute: false });
      // 固定模型返回候选清单以外的名称，模拟异常提案经过真实聊天调度。
      chat.mockImplementationOnce(async (_messages, names) => {
        expect(names).not.toContain(name);
        return { tool: name as ChatToolName, args };
      });
      expect((await run('admin', '修改公司等级')).body.assistantMessage.content.code).toBe('TOOL_UNAVAILABLE');
      const ctx = dispatch.mock.calls[0][1]!;
      expect(await registry.findByName(name, ctx)).toBeUndefined();
      expect((await registry.listAvailable(ctx)).map(tool => tool.name)).not.toContain(name);
      expect((await registry.execute(name, ctx, args)).code).toBe('TOOL_UNAVAILABLE');
      expect(await registry.prepareWrite(name, 'validate', ctx, args)).toEqual({ validated: true });
      expect(await registry.prepareWrite(name, 'preview', ctx, args)).toEqual({
        target: 'company', operation: 'update', changedFields: ['level'],
      });
      await expect(registry.prepareWrite(name, 'preview', ctx, { ...args, password: 'private' })).rejects.toMatchObject({ status: 400 });
      await expect(registry.prepareWrite(name, 'preview', ctx, { ...args, companyCode: 'missing' })).rejects.toMatchObject({ status: 404 });
      await expect(registry.prepareWrite(name, 'preview', { ...ctx }, args)).rejects.toMatchObject({ status: 401 });
      const writeAudits = (await auditItems('admin')).filter(row => row.toolName === name);
      expect(writeAudits.filter(row => row.action === 'tool.execute')).toHaveLength(2);
      expect(writeAudits.filter(row => row.action === 'company.update.preview')).toHaveLength(3);
      expect(JSON.stringify(writeAudits)).not.toContain('private');
      await db.query('UPDATE users SET is_admin=false WHERE id=$1', [ctx.userId]);
      await expect(registry.prepareWrite(name, 'preview', ctx, args)).rejects.toMatchObject({ status: 403 });
      expect(await write.execute(ctx, args)).toEqual({ code: 'WRITE_EXECUTION_DISABLED' });
      expect(await write.rollback(ctx, randomUUID())).toEqual({ code: 'ROLLBACK_UNSUPPORTED' });
      expect(update).not.toHaveBeenCalled();
      expect((await service.get(args.companyCode)).level).toBe(2);
    } finally {
      await db.query('UPDATE users SET is_admin=true WHERE id=$1', [actors.admin]);
      dispatch.mockRestore();
      enabled.mockRestore();
      update.mockRestore();
    }
  });

  it('组合筛选、降序和分页与 GET /users 对齐，每行严格限制四个字段', async () => {
    for (const [page, suffixes] of [[1, ['C', 'B']], [2, ['A']], [3, []]] as const) {
      const api = await request(app.getHttpServer()).get('/users').auth(tokens.get('admin')!, { type: 'bearer' })
        .query({ ...args, roles: args.roles.join(','), page }).expect(200);
      const assistantMessage = await checkedTurn('admin',
        `查姓名含 ${search} 的已停用用户，岗位为 Analyst 或 Manager，按姓名降序，每页 2 人，第 ${page} 页`,
        'query_users', { ...args, page });
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
      const { content: result } = await checkedTurn(actor, '查用户', 'query_users', args, 'FORBIDDEN');
      expect(result).toMatchObject({ code: 'FORBIDDEN', resultType: 'text', data: null, message: expect.stringContaining('权限') });
      await request(app.getHttpServer()).get('/users').auth(tokens.get(actor)!, { type: 'bearer' }).expect(403);
      expect(list).not.toHaveBeenCalled();
      expect(await auditItems(actor)).toContainEqual(expect.objectContaining({ userId: actors[actor], toolName: 'query_users',
        action: 'users.read', result: 'failure', resultSummary: { code: 'FORBIDDEN', resultType: 'text' } }));
      const context = execute.mock.calls[0][1];
      await expect(app.get(UserManagementService).list(new UserListDto(), context)).rejects.toMatchObject({ status: 403 });
    } finally { list.mockRestore(); execute.mockRestore(); }
  });

  it('非法状态在进入 Service 前被拒绝', async () => {
    const list = vi.spyOn(app.get(UserManagementService), 'list');
    try {
      for (const status of ['', null, ['active'], 'paused']) {
        const message = await checkedTurn('admin', '查用户', 'query_users', { status }, 'INVALID_ARGUMENTS');
        expect(message.content).toMatchObject({ code: 'INVALID_ARGUMENTS', data: null });
      }
      await request(app.getHttpServer()).get('/users').auth(tokens.get('admin')!, { type: 'bearer' })
        .query({ status: 'paused' }).expect(400);
      expect(list).not.toHaveBeenCalled();
    } finally { list.mockRestore(); }
  });

  it('用户筛选无匹配时两端都返回零条', async () => {
    const input = { search: search + '-missing' };
    const api = await businessGet('admin', '/users').query(input).expect(200);
    expect(api.body).toEqual({ items: [], total: 0, page: 1, pageSize: 10 });
    const message = await checkedTurn('admin', '查用户', 'query_users', input);
    expect(message.content.data).toEqual({ tableType: 'users', ...api.body });
  });

  it('公司表格按页对照业务字段，零员工返回 null，无匹配返回空表', async () => {
    const filters = { country, city: 'London', levels: [2, 3], sortBy: 'companyName', sortOrder: 'asc', pageSize: 1 };
    for (const [page, expectedRevenue] of [[1, 100], [2, null]] as const) {
      const api = await businessGet('member', '/companies').query({ ...filters, levels: '2,3', page }).expect(200);
      const { items, ...paging } = api.body;
      expect(paging).toEqual({ page, pageSize: 1, total: 2 });
      expect(items).toEqual([expect.objectContaining({ companyCode: companyCodes[page - 1], revenuePerEmployee: expectedRevenue })]);
      const rows = items.map(({ createdAt: _created, updatedAt: _updated, ...row }: Record<string, unknown>) => row);
      const message = await checkedTurn('member', '查公司', 'query_companies', { ...filters, page });
      expect(message.messageType).toBe('table');
      expect(message.content.data).toEqual({ tableType: 'companies', ...paging, items: rows });
    }
    const empty = { country, city: 'Paris' };
    const api = await businessGet('member', '/companies').query(empty).expect(200);
    expect(api.body).toEqual({ items: [], total: 0, page: 1, pageSize: 10 });
    const message = await checkedTurn('member', '查公司', 'query_companies', empty);
    expect(message.content.data).toEqual({ tableType: 'companies', ...api.body });
  });

  it('Dashboard 按成立年份和国家对照四项指标、等级分布、累计趋势及空报表', async () => {
    const filters = { country, foundedYearFrom: 2018, foundedYearTo: 2020 };
    const api = await businessGet('member', '/dashboard').query(filters).expect(200);
    expect(api.body).toEqual({
      summary: { companyCount: 2, totalRevenue: 242, countryCount: 1, employeeCount: 2 },
      levelDistribution: [{ level: 2, count: 1, percentage: 50 }, { level: 3, count: 1, percentage: 50 }],
      yearlyGrowth: [{ year: 2018, newCompanies: 1, cumulativeCompanies: 1 },
        { year: 2019, newCompanies: 0, cumulativeCompanies: 1 }, { year: 2020, newCompanies: 1, cumulativeCompanies: 2 }],
    });
    const report = await checkedTurn('member', '查看 Dashboard', 'dashboard_metrics', filters);
    expect(report.messageType).toBe('report');
    expect(report.content.data).toEqual(api.body);
    const empty = { ...filters, foundedYearFrom: 2019, foundedYearTo: 2019 };
    const noMatches = await businessGet('member', '/dashboard').query(empty).expect(200);
    expect(noMatches.body).toEqual({
      summary: { companyCount: 0, totalRevenue: 0, countryCount: 0, employeeCount: 0 }, levelDistribution: [], yearlyGrowth: [],
    });
    const emptyReport = await checkedTurn('member', '查看 Dashboard', 'dashboard_metrics', empty);
    expect(emptyReport.content.data).toEqual(noMatches.body);
  });

  it('公司非法分页和 Dashboard 颠倒年份分别返回参数错误', async () => {
    const invalidPage = { pageSize: 101 };
    await businessGet('member', '/companies').query(invalidPage).expect(400);
    const company = await checkedTurn('member', '查公司', 'query_companies', invalidPage, 'INVALID_ARGUMENTS');
    expect(company.content.data).toBeNull();
    const invalidYears = { foundedYearFrom: 2020, foundedYearTo: 2018 };
    await businessGet('member', '/dashboard').query(invalidYears).expect(400);
    const dashboard = await checkedTurn('member', '查看 Dashboard', 'dashboard_metrics', invalidYears, 'INVALID_ARGUMENTS');
    expect(dashboard.content.data).toBeNull();
  });

  it('新回合复用规范化后的公司结果，按用户、分页和条件隔离，实际过期后重新查询', async () => {
    const input = { country, city: ' London ', levels: [3, 2], pageSize: 2 };
    const equivalent = { ...input, levels: [2, 3], city: 'London', page: 1, sortBy: 'companyCode', sortOrder: 'asc' };
    const ask = (actor: Actor, query: Record<string, unknown>) => checkedTurn(actor, '查公司', 'query_companies', query);
    const cache = app.get(AiCacheService);
    const cached = vi.spyOn(cache, 'getOrLoadChat');
    const list = vi.spyOn(app.get(CompaniesService), 'list');
    try {
      const first = await ask('member', input);
      expect(list).toHaveBeenCalledTimes(1);
      const key = cached.mock.calls[0][0];
      const snapshot = await cache.get(key);
      expect(snapshot).toMatchObject({ resultType: 'table', data: first.content.data });
      const next = await ask('member', equivalent);
      expect(next.id).not.toBe(first.id);
      expect(next.content).toEqual(first.content);
      expect(list).toHaveBeenCalledTimes(1);
      await ask('manager', equivalent);
      await ask('member', { ...input, page: 2 });
      await ask('member', { ...input, levels: [2] });
      expect(list).toHaveBeenCalledTimes(4);
      await cache.set(key, snapshot!, 1);
      await vi.waitFor(async () => expect(await cache.get(key)).toBeUndefined(), { timeout: 3000 });
      expect((await ask('member', equivalent)).content).toEqual(first.content);
      expect(list).toHaveBeenCalledTimes(5);
    } finally { cached.mockRestore(); list.mockRestore(); }
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
        .query({ result: 'failure', pageSize: 100 }).expect(200);
      expect(audits.body.hasMore).toBe(false);
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
      await checkedTurn('admin', '查用户', 'query_users', { search: searchInput });
      expect(list).toHaveBeenCalledTimes(2);
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
      const filters = { ...args, sortBy: 'email' };
      propose(filters);
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
      const fresh = await checkedTurn('admin', '查用户', 'query_users', filters, 'FORBIDDEN');
      expect(fresh.content.data).toBeNull();
      expect(list).not.toHaveBeenCalled();
    } finally {
      list.mockRestore();
      await db.query('UPDATE users SET is_admin=true WHERE id=$1', [actors.admin]);
    }
  });
});
