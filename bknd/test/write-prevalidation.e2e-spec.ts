import { Body, Controller, Inject, Param, Post, Query, Req, UseGuards, type INestApplication, type Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import request from 'supertest';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/setup-app.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { JwtAuthGuard, type ToolRequest, type ToolContext } from '../src/jwt-auth.guard.js';
import { PG_POOL } from '../src/database/database.module.js';
import { UsersModule } from '../src/users/users.module.js';
import { CompaniesModule } from '../src/companies/companies.module.js';
import { CompaniesService } from '../src/companies/companies.service.js';
import { CreateCompanyDto, UpdateCompanyDto } from '../src/companies/company.dto.js';
import { AiToolsModule } from '../src/ai/tools/ai-tools.module.js';
import { ToolRegistryService } from '../src/ai/tools/tool-registry.service.js';
import { AiAuditService } from '../src/ai/services/ai-audit.service.js';
import { BaseWriteTool, executionClosed, rollbackUnsupported, type WritePhase } from '../src/ai/tools/write/base-write-tool.js';
import { WriteTool, type WriteMetadata } from '../src/ai/tools/write/write-tool.decorator.js';
import { NoWriteBody, type WriteTargetParam } from '../src/ai/tools/write/write-prevalidation.service.js';

import { UserCreateTool, UserUpdateTool, UserDeleteTool, UserBatchDeleteTool } from '../src/ai/tools/write/user-write-tools.js';

// 用户操作从 AiToolsModule 加载正式 provider；公司预校验仍用测试适配器。
function fixture<Args extends object, Service>(name: string, target: WriteMetadata['target'], operation: WriteMetadata['operation'],
  dto: Type<Args>, param: WriteTargetParam | undefined, service: Type<Service>,
  check: (service: Service, args: Args, id: string) => Promise<unknown>) {
  @WriteTool({ name, target, operation })
  class Fixture extends BaseWriteTool<Args> {
    readonly inputDto = dto;
    readonly targetParam = param;
    readonly execute = executionClosed;
    readonly rollback = rollbackUnsupported;
    constructor(@Inject(service) private readonly business: Service) { super(); }
    protected async validate(_context: ToolContext, args: Args, id?: string) { await check(this.business, args, id!); }
    protected getPreview() { return [] as const; }
  }
  return Fixture;
}
const userTools = [
  ['userCreateTool', 'create', UserCreateTool], ['userUpdateTool', 'update', UserUpdateTool],
  ['userDeleteTool', 'delete', UserDeleteTool], ['userBatchDeleteTool', 'batchDelete', UserBatchDeleteTool],
] as const;
const companyFixtures = [
  fixture('cc', 'company', 'create', CreateCompanyDto, undefined, CompaniesService, (s, a) => s.validateCreate(a)),
  fixture('cu', 'company', 'update', UpdateCompanyDto, 'companyCode', CompaniesService, (s, a, id) => s.validateUpdate(id, a)),
  fixture('cd', 'company', 'delete', NoWriteBody, 'companyCode', CompaniesService, (s, _, id) => s.validateRemove(id)),
];

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

describe('写入预校验与业务 HTTP 错误逐项对照', () => {
  let app: INestApplication;
  let calls: ReturnType<typeof watchTool>[];
  let db: pg.Pool;
  let adminToken: string;
  let memberToken: string;
  const admin = randomUUID(), member = randomUUID(), referenced = randomUUID(), missing = randomUUID();
  const code = 'pre-' + admin, free = code + '-free';
  const user = { email: admin + '@example.test', password: 'Synthetic fixture password', name: 'Example', role: 'Member', status: 'active' };
  const company = { companyCode: code, companyName: 'Example', country: 'UK', city: 'London', level: 2, employees: 1, foundedYear: 2020, annualRevenue: 1 };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule, AiToolsModule, AuthModule, UsersModule, CompaniesModule],
      providers: companyFixtures, controllers: [TestPreparation],
    }).overrideProvider(AiAuditService).useValue({ recordToolExecution: vi.fn() }).compile();
    app = mod.createNestApplication();
    setupApp(app);
    await app.init();
    calls = [...userTools.map(([, , type]) => watchTool(app.get(type))),
      ...companyFixtures.map(type => watchTool(app.get(type)))];
    db = app.get(PG_POOL);
    for (const id of [admin, member, referenced]) {
      await db.query('INSERT INTO users(id,email,password_hash,is_admin) VALUES ($1,$2,$3,$4)', [id, id + '@example.test', '$argon2id$fixture', id === admin]);
    }
    await db.query('INSERT INTO ai_user_memory(user_id,content) VALUES ($1,$2)', [referenced, 'fixture']);
    for (const c of [code, free]) await app.get(CompaniesService).create({ ...company, companyCode: c });
    await db.query('INSERT INTO relationships(company_code) VALUES ($1)', [code]);
    const jwt = app.get(JwtService);
    adminToken = await jwt.signAsync({ sub: admin });
    memberToken = await jwt.signAsync({ sub: member });
  });
  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => {
    if (db) {
      await db.query('DELETE FROM relationships WHERE company_code=$1', [code]);
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
    const relations = await db.query('SELECT * FROM relationships WHERE company_code=$1', [code]);
    return [users.rows, companies.rows, relations.rows];
  }

  const cases: [string, 'post' | 'patch' | 'delete', string, object, number, ('admin' | 'member' | 'none' | 'invalid')?][] = [
    ['userUpdateTool/bad', 'patch', '/users/bad', {}, 401, 'none'],
    ['cd/missing', 'delete', '/companies/missing', {}, 401, 'invalid'],
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
    ['cc', 'post', '/companies', { ...company, employees: null }, 400],
    ['cc', 'post', '/companies', company, 409],
    ['cu/' + code, 'patch', '/companies/' + code, { companyCode: 'other' }, 400],
    ['cu/' + missing, 'patch', '/companies/' + missing, { level: 2 }, 404],
    ['cd/' + code, 'delete', '/companies/' + code, {}, 409],
    ['cd/' + missing, 'delete', '/companies/' + missing, {}, 404],
  ];
  it.each(cases)('%s 与 %s %s 返回相同错误', async (name, method, path, args, status, actor = 'admin') => {
    const http = request(app.getHttpServer());
    const auth = actor === 'none' ? {} : { Authorization: 'Bearer ' + ({ admin: adminToken, member: memberToken, invalid: 'invalid' }[actor]) };
    const before = await snapshot();
    const expected = await http[method](path).set(auth).send(args).expect(status);
    const actual = await http.post('/test-prevalidation/' + name).set(auth).send(args).expect(status);
    expect(actual.body).toEqual(expected.body);
    for (const tool of calls) {
      expect(tool.preview).not.toHaveBeenCalled();
      expect(tool.execute).not.toHaveBeenCalled();
    }
    expect(await snapshot()).toEqual(before);
  });

  it('七种合法操作均通过预校验和预览，业务表与更新时间逐行一致', async () => {
    const before = await snapshot();
    for (const [path, args, changedFields] of [
      ['userCreateTool', { ...user, email: missing + '@example.test' }, ['role', 'status', 'name']],
      ['userUpdateTool/' + member, { email: member + '@example.test', status: 'inactive' }, ['status']],
      ['userDeleteTool/' + member, {}, []], ['userBatchDeleteTool', { ids: [member] }, []],
      ['cc', { ...company, companyCode: code + '-new' }, []], ['cu/' + free, { level: 4 }, []], ['cd/' + free, {}, []],
    ] as const) {
      const prepare = () => request(app.getHttpServer()).post('/test-prevalidation/' + path).auth(adminToken, { type: 'bearer' });
      const validated = await prepare().query({ phase: 'validate' }).send(args).expect(201);
      expect(validated.body).toEqual({ validated: true });
      const result = await prepare().send(args).expect(201);
      expect(result.body.changedFields).toEqual(changedFields);
      expect(JSON.stringify(result.body)).not.toContain(user.password);
      expect(await snapshot()).toEqual(before);
    }
    for (const tool of calls) {
      expect(tool.preview).toHaveBeenCalledTimes(1);
      expect(tool.execute).not.toHaveBeenCalled();
    }
  });

  it('四个用户工具仅在写注册表可见，真实执行入口与回滚入口关闭', async () => {
    const registry = app.get(ToolRegistryService);
    // 经 JWT 守卫取得本次真实签发的上下文，不从请求体模拟管理员身份。
    const prepare = vi.spyOn(registry, 'prepareWrite');
    try {
      await request(app.getHttpServer()).post('/test-prevalidation/userDeleteTool/' + member)
        .auth(adminToken, { type: 'bearer' }).query({ phase: 'validate' }).expect(201);
      const context = prepare.mock.calls[0][2]!;
      const available = (await registry.listAvailable(context)).map(meta => meta.name);
      const before = await snapshot();
      for (const [name, operation, type] of userTools) {
        expect(registry.describeWrite(name)).toEqual({ name, target: 'user', operation, kind: 'write', autoExecute: false });
        expect(available).not.toContain(name);
        expect((await registry.execute(name, context, {})).code).toBe('TOOL_UNAVAILABLE');
        const tool = app.get(type);
        expect(await tool.execute(context, {})).toEqual({ code: 'WRITE_EXECUTION_DISABLED' });
        expect(await tool.rollback(context, randomUUID())).toEqual({ code: 'ROLLBACK_UNSUPPORTED' });
      }
      expect(await snapshot()).toEqual(before);
    } finally { prepare.mockRestore(); }
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
