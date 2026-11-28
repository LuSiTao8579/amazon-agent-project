import { Body, Controller, Inject, Param, Post, Query, Req, UseGuards, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import request from 'supertest';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/setup-app.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { JwtAuthGuard, type ToolRequest } from '../src/jwt-auth.guard.js';
import { PG_POOL } from '../src/database/database.module.js';
import { UsersModule } from '../src/users/users.module.js';
import { UserManagementService } from '../src/users/user-management.service.js';
import { CompaniesModule } from '../src/companies/companies.module.js';
import { CompaniesService } from '../src/companies/companies.service.js';
import { AiToolsModule } from '../src/ai/tools/ai-tools.module.js';
import { ToolRegistryService } from '../src/ai/tools/tool-registry.service.js';
import { AiAuditService } from '../src/ai/services/ai-audit.service.js';
import type { BaseWriteTool, WritePhase } from '../src/ai/tools/write/base-write-tool.js';
import { UserCreateTool, UserUpdateTool, UserDeleteTool, UserBatchDeleteTool } from '../src/ai/tools/write/user-write-tools.js';
import { CompanyCreateTool, CompanyUpdateTool, CompanyDeleteTool } from '../src/ai/tools/write/company-write-tools.js';

@Controller('test-prevalidation')
@UseGuards(JwtAuthGuard)
class TestPreparation {
  constructor(@Inject(ToolRegistryService) private readonly tools: ToolRegistryService) {}
  @Post([':name', ':name/:target'])
  prepare(@Req() req: ToolRequest, @Param('name') name: string, @Param('target') target: string | undefined, @Body() args: unknown,
    @Query('phase') phase: WritePhase = 'preview') {
    return this.tools.prepareWrite(name, phase, req.toolContext, args, target);
  }
}

function watchTool(tool: BaseWriteTool<object>) {
  // 观察受保护的预览钩子，保留原实现及返回值。
  const hooks = tool as unknown as { getPreview: BaseWriteTool<object>['getPreview'] };
  return { preview: vi.spyOn(hooks, 'getPreview'), execute: vi.spyOn(tool, 'execute') };
}

function watchBusinessWrites(service: UserManagementService | CompaniesService) {
  return [vi.spyOn(service, 'create'), vi.spyOn(service, 'update'), vi.spyOn(service, 'remove')];
}

describe('写入预校验与业务 HTTP 错误逐项对照', () => {
  let app: INestApplication;
  let calls: ReturnType<typeof watchTool>[];
  let businessWrites: ReturnType<typeof watchBusinessWrites>;
  let db: pg.Pool;
  let adminToken: string;
  let memberToken: string;
  const admin = randomUUID(), member = randomUUID(), referenced = randomUUID(), missing = randomUUID();
  const code = 'pre-' + admin, parent = code + '-parent', free = code + '-free';
  const user = { email: admin + '@example.test', password: 'Synthetic fixture password', name: 'Example', role: 'Member', status: 'active' };
  const company = { companyCode: code, companyName: 'Example', country: 'UK', city: 'London', level: 2, employees: 1, foundedYear: 2020, annualRevenue: 1 };

  const writeTools = [
    { name: 'userCreateTool', target: 'user', operation: 'create', type: UserCreateTool, targetId: '',
      body: { ...user, email: missing + '@example.test' }, fields: ['role', 'status', 'name'] },
    { name: 'userUpdateTool', target: 'user', operation: 'update', type: UserUpdateTool, targetId: member,
      body: { email: member + '@example.test', status: 'inactive' }, fields: ['status'] },
    { name: 'userDeleteTool', target: 'user', operation: 'delete', type: UserDeleteTool, targetId: member, body: {}, fields: [] },
    { name: 'userBatchDeleteTool', target: 'user', operation: 'batchDelete', type: UserBatchDeleteTool, targetId: '',
      body: { ids: [member] }, fields: [] },
    // 与现有公司同名、不同编码，同时取各数值上限。
    { name: 'companyCreateTool', target: 'company', operation: 'create', type: CompanyCreateTool, targetId: '',
      body: { ...company, companyCode: code + '-new', level: 100, foundedYear: 9999, employees: 2147483647, annualRevenue: 999999999999999 },
      fields: ['level', 'city', 'country', 'companyName', 'employees', 'foundedYear'] },
    { name: 'companyUpdateTool', target: 'company', operation: 'update', type: CompanyUpdateTool, targetId: free,
      body: { level: 1, foundedYear: 1, employees: 0, annualRevenue: 0 }, fields: ['level', 'employees', 'foundedYear'] },
    { name: 'companyDeleteTool', target: 'company', operation: 'delete', type: CompanyDeleteTool, targetId: free, body: {}, fields: [] },
  ];

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule, AiToolsModule, AuthModule, UsersModule, CompaniesModule],
      controllers: [TestPreparation],
    }).overrideProvider(AiAuditService).useValue({ recordToolExecution: vi.fn() }).compile();
    app = mod.createNestApplication();
    setupApp(app);
    await app.init();
    calls = writeTools.map(({ type }) => watchTool(app.get(type)));
    db = app.get(PG_POOL);
    for (const id of [admin, member, referenced]) {
      await db.query('INSERT INTO users(id,email,password_hash,is_admin) VALUES ($1,$2,$3,$4)', [id, id + '@example.test', '$argon2id$fixture', id === admin]);
    }
    await db.query('INSERT INTO ai_user_memory(user_id,content) VALUES ($1,$2)', [referenced, 'fixture']);
    const companies = app.get(CompaniesService);
    for (const c of [code, parent, free]) await companies.create({ ...company, companyCode: c });
    // parent 只在 parent_company 一列出现，free 两列都不出现。
    await db.query('INSERT INTO relationships(company_code,parent_company) VALUES ($1,$2)', [code, parent]);
    for (const method of ['get', 'validateCreate', 'validateUpdate', 'validateRemove'] as const) vi.spyOn(companies, method);
    businessWrites = [...watchBusinessWrites(app.get(UserManagementService)), ...watchBusinessWrites(companies)];
    const jwt = app.get(JwtService);
    adminToken = await jwt.signAsync({ sub: admin });
    memberToken = await jwt.signAsync({ sub: member });
  });
  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => {
    if (db) {
      await db.query('DELETE FROM relationships WHERE company_code LIKE $1 OR parent_company LIKE $1', [code + '%']);
      await db.query('DELETE FROM companies WHERE company_code LIKE $1', [code + '%']);
      await db.query('DELETE FROM ai_user_memory WHERE user_id=$1', [referenced]);
      await db.query('DELETE FROM users WHERE id=ANY($1::uuid[]) OR email=$2', [[admin, member, referenced], missing + '@example.test']);
    }
    await app?.close();
  });

  async function snapshot() {
    const users = await db.query('SELECT * FROM users WHERE id=ANY($1::uuid[]) OR email=$2 ORDER BY id',
      [[admin, member, referenced], missing + '@example.test']);
    const companies = await db.query('SELECT * FROM companies WHERE company_code LIKE $1 ORDER BY company_code', [code + '%']);
    const relations = await db.query('SELECT * FROM relationships WHERE company_code LIKE $1 OR parent_company LIKE $1 ORDER BY company_code', [code + '%']);
    return [users.rows, companies.rows, relations.rows];
  }

  const cases: [string, 'post' | 'patch' | 'delete', string, object, number, ('admin' | 'member' | 'none' | 'invalid')?][] = [
    ['userUpdateTool/bad', 'patch', '/users/bad', {}, 401, 'none'],
    ['companyDeleteTool/missing', 'delete', '/companies/missing', {}, 401, 'invalid'],
    ['userUpdateTool/' + missing, 'patch', '/users/' + missing, { role: 'invalid' }, 403, 'member'],
    ['userCreateTool', 'post', '/users', {}, 400],
    ['userCreateTool', 'post', '/users', { ...user, email: 'bad', password: 'short', name: ' ', role: 'owner', status: 'other' }, 400],
    ['userCreateTool', 'post', '/users', { ...user, isAdmin: true }, 400],
    ['userCreateTool', 'post', '/users', { ...user, email: '  ' + user.email.toUpperCase() + ' ' }, 409],
    ['userUpdateTool/bad', 'patch', '/users/bad', { status: 'inactive' }, 400],
    ['userUpdateTool/bad', 'patch', '/users/bad', { status: null }, 400],
    ['userUpdateTool/' + member, 'patch', '/users/' + member, { role: 'Invalid', status: null }, 400],
    ['userUpdateTool/' + member, 'patch', '/users/' + member, {}, 400],
    ['userUpdateTool/' + member, 'patch', '/users/' + member, { email: user.email }, 409],
    ['userUpdateTool/' + admin, 'patch', '/users/' + admin, { status: 'inactive' }, 403],
    ['userUpdateTool/' + missing, 'patch', '/users/' + missing, { name: 'X' }, 404],
    ['userDeleteTool/' + admin, 'delete', '/users/' + admin, {}, 403],
    ['userDeleteTool/' + referenced, 'delete', '/users/' + referenced, {}, 409],
    ['userBatchDeleteTool', 'post', '/users/bulk-delete', { ids: [member, referenced] }, 409],
    ['userBatchDeleteTool', 'post', '/users/bulk-delete', { ids: [member, admin] }, 403],
    ['userBatchDeleteTool', 'post', '/users/bulk-delete', { ids: [member, member] }, 400],
    ['userBatchDeleteTool', 'post', '/users/bulk-delete', { ids: [] }, 400],
    ['userBatchDeleteTool', 'post', '/users/bulk-delete', { ids: ['bad'] }, 400],
    ['userBatchDeleteTool', 'post', '/users/bulk-delete', { ids: Array.from({ length: 101 }, () => randomUUID()) }, 400],
    ['userBatchDeleteTool', 'post', '/users/bulk-delete', { ids: [member, missing] }, 404],
    ['companyCreateTool', 'post', '/companies', company, 403, 'member'],
    ['companyUpdateTool/' + missing, 'patch', '/companies/' + missing, { level: 0 }, 403, 'member'],
    ['companyDeleteTool/' + parent, 'delete', '/companies/' + parent, {}, 403, 'member'],
    ['companyCreateTool', 'post', '/companies', {}, 400],
    ['companyCreateTool', 'post', '/companies', { ...company, companyCode: '含空格 code' }, 400],
    ['companyCreateTool', 'post', '/companies', { ...company, employees: null }, 400],
    ['companyCreateTool', 'post', '/companies', { ...company, companyName: 'Different name' }, 409],
    ['companyUpdateTool/' + code, 'patch', '/companies/' + code, {}, 400],
    ['companyUpdateTool/' + code, 'patch', '/companies/' + code, { companyCode: 'other' }, 400],
    ['companyUpdateTool/' + code, 'patch', '/companies/' + code, { level: 101 }, 400],
    ['companyUpdateTool/' + code, 'patch', '/companies/' + code, { foundedYear: 0 }, 400],
    ['companyUpdateTool/' + code, 'patch', '/companies/' + code, { annualRevenue: 1.234 }, 400],
    ['companyUpdateTool/' + code, 'patch', '/companies/' + code, { employees: 2147483648 }, 400],
    ['companyUpdateTool/' + missing, 'patch', '/companies/' + missing, { level: 2 }, 404],
    ['companyDeleteTool/' + code, 'delete', '/companies/' + code, {}, 409],
    ['companyDeleteTool/' + parent, 'delete', '/companies/' + parent, {}, 409],
    ['companyDeleteTool/' + missing, 'delete', '/companies/' + missing, {}, 404],
  ];
  it.each(cases)('%s 与 %s %s 返回相同错误', async (name, method, path, args, status, actor = 'admin') => {
    const http = request(app.getHttpServer());
    const auth = actor === 'none' ? {} : { Authorization: 'Bearer ' + ({ admin: adminToken, member: memberToken, invalid: 'invalid' }[actor]) };
    const before = await snapshot();
    const expected = await http[method](path).set(auth).send(args).expect(status);
    // 业务 HTTP 对照请求可能已进入写方法；单独核对随后 AI 准备阶段的调用增量。
    const beforePrepare = businessWrites.map(method => method.mock.calls.length);
    const actual = await http.post('/test-prevalidation/' + name).set(auth).send(args).expect(status);
    expect(actual.body).toEqual(expected.body);
    expect(businessWrites.map(method => method.mock.calls.length)).toEqual(beforePrepare);
    if (actor === 'member' && name.startsWith('company')) {
      const companies = app.get(CompaniesService);
      for (const method of ['get', 'validateCreate', 'validateUpdate', 'validateRemove'] as const) {
        expect(companies[method]).not.toHaveBeenCalled();
      }
    }
    for (const tool of calls) {
      expect(tool.preview).not.toHaveBeenCalled();
      expect(tool.execute).not.toHaveBeenCalled();
    }
    expect(await snapshot()).toEqual(before);
  });

  it.each(writeTools)('$name 的双账号准备与执行拦截', async ({ name, target, operation, type, targetId, body, fields }) => {
    const registry = app.get(ToolRegistryService);
    const tool = app.get(type);
    const prepare = vi.spyOn(registry, 'prepareWrite');
    const before = await snapshot();
    try {
      expect(registry.describeWrite(name)).toEqual({ name, target, operation, kind: 'write', autoExecute: false });
      for (const [actor, token] of [[member, memberToken], [admin, adminToken]]) {
        const path = ['/test-prevalidation', name, targetId].filter(Boolean).join('/');
        const post = (phase: WritePhase) => request(app.getHttpServer()).post(path)
          .auth(token, { type: 'bearer' }).query({ phase }).send(body);
        if (actor === admin) {
          expect((await post('validate').expect(201)).body).toEqual({ validated: true });
          expect((await post('preview').expect(201)).body).toEqual({ operation, target, changedFields: fields });
        } else {
          await post('validate').expect(403);
          await post('preview').expect(403);
          for (const call of calls) expect(call.preview).not.toHaveBeenCalled();
        }
        const context = prepare.mock.lastCall![2]!;
        expect(context.userId).toBe(actor);
        const available = (await registry.listAvailable(context)).map(meta => meta.name);
        expect(available).not.toContain(name);
        expect((await registry.execute(name, context, body)).code).toBe('TOOL_UNAVAILABLE');
        expect(await tool.execute(context, body)).toEqual({ code: 'WRITE_EXECUTION_DISABLED' });
        expect(await tool.rollback(context, randomUUID())).toEqual({ code: 'ROLLBACK_UNSUPPORTED' });
        expect(await snapshot()).toEqual(before);
        for (const method of businessWrites) expect(method).not.toHaveBeenCalled();
      }
      expect(tool.execute).toHaveBeenCalledTimes(2); // 两个账号各直接验证关闭的骨架一次
      expect(calls.reduce((count, call) => count + call.preview.mock.calls.length, 0)).toBe(1);
    } finally { prepare.mockRestore(); }
  });

  it('仅修改营收时预览通过，仅返回操作、目标类型和空的可展示字段列表', async () => {
    const before = await snapshot();
    const res = await request(app.getHttpServer()).post('/test-prevalidation/companyUpdateTool/' + free)
      .auth(adminToken, { type: 'bearer' }).send({ annualRevenue: 321654.78 }).expect(201);
    expect(res.body).toEqual({ operation: 'update', target: 'company', changedFields: [] });
    expect(await snapshot()).toEqual(before);
  });

  it('一次预检允许 100 个不同普通用户，整批记录保持原值', async () => {
    const ids = Array.from({ length: 100 }, () => randomUUID());
    const rows = async () => (await db.query('SELECT * FROM users WHERE id=ANY($1::uuid[]) ORDER BY id', [ids])).rows;
    try {
      await db.query(`INSERT INTO users(id,email,password_hash)
        SELECT id, id::text || '@example.test', '$argon2id$fixture' FROM unnest($1::uuid[]) AS batch(id)`, [ids]);
      const before = await rows();
      expect(before).toHaveLength(100);
      const response = await request(app.getHttpServer()).post('/test-prevalidation/userBatchDeleteTool')
        .auth(adminToken, { type: 'bearer' }).query({ phase: 'validate' }).send({ ids }).expect(201);
      expect(response.body).toEqual({ validated: true });
      expect(await rows()).toEqual(before);
    } finally {
      await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [ids]);
    }
  });
});
