import { Body, Controller, Inject, Param, Post, Req, UseGuards, type INestApplication, type Type } from '@nestjs/common';
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
import { UserManagementModule } from '../src/users/user-management.module.js';
import { UserManagementService } from '../src/users/user-management.service.js';
import { CreateUserDto, UpdateUserDto, DeleteUsersDto } from '../src/users/user-management.dto.js';
import { CompaniesModule } from '../src/companies/companies.module.js';
import { CompaniesService } from '../src/companies/companies.service.js';
import { CreateCompanyDto, UpdateCompanyDto } from '../src/companies/company.dto.js';
import { AiToolsModule } from '../src/ai/tools/ai-tools.module.js';
import { ToolRegistryService } from '../src/ai/tools/tool-registry.service.js';
import { AiAuditService } from '../src/ai/services/ai-audit.service.js';
import { BaseWriteTool, executionClosed, rollbackUnsupported } from '../src/ai/tools/write/base-write-tool.js';
import { WriteTool, type WriteMetadata } from '../src/ai/tools/write/write-tool.decorator.js';
import { NoWriteBody, type WriteTargetParam } from '../src/ai/tools/write/write-prevalidation.service.js';

const preview = vi.fn(() => [] as const);
// 七个适配器仅注册到测试应用。使用真实注册中心、JWT、DTO 与业务 Service。
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
    protected getPreview = preview;
  }
  return Fixture;
}
const fixtures = [
  fixture('uc', 'user', 'create', CreateUserDto, undefined, UserManagementService, (s, a) => s.validateCreate(a)),
  fixture('uu', 'user', 'update', UpdateUserDto, 'userId', UserManagementService, (s, a, id) => s.validateUpdate(id, a)),
  fixture('ud', 'user', 'delete', NoWriteBody, 'userId', UserManagementService, (s, _, id) => s.validateRemove([id])),
  fixture('ub', 'user', 'batchDelete', DeleteUsersDto, undefined, UserManagementService, (s, a) => s.validateRemove(a.ids)),
  fixture('cc', 'company', 'create', CreateCompanyDto, undefined, CompaniesService, (s, a) => s.validateCreate(a)),
  fixture('cu', 'company', 'update', UpdateCompanyDto, 'companyCode', CompaniesService, (s, a, id) => s.validateUpdate(id, a)),
  fixture('cd', 'company', 'delete', NoWriteBody, 'companyCode', CompaniesService, (s, _, id) => s.validateRemove(id)),
];

@Controller('test-prevalidation')
@UseGuards(JwtAuthGuard)
class TestPreparation {
  constructor(@Inject(ToolRegistryService) private readonly tools: ToolRegistryService) {}
  @Post([':name', ':name/:target'])
  prepare(@Req() req: ToolRequest, @Param('name') name: string, @Param('target') target: string | undefined, @Body() args: unknown) {
    return this.tools.prepareWrite(name, 'preview', req.toolContext, args, target);
  }
}

describe('写入预校验与业务 HTTP 错误逐项对照', () => {
  let app: INestApplication;
  let db: pg.Pool;
  let adminToken: string;
  let memberToken: string;
  const admin = randomUUID(), member = randomUUID(), referenced = randomUUID(), missing = randomUUID();
  const code = 'pre-' + admin, free = code + '-free';
  const user = { email: admin + '@example.test', password: 'Synthetic fixture password', name: 'Example', role: 'Member', status: 'active' };
  const company = { companyCode: code, companyName: 'Example', country: 'UK', city: 'London', level: 2, employees: 1, foundedYear: 2020, annualRevenue: 1 };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule, AiToolsModule, AuthModule, UsersModule, UserManagementModule, CompaniesModule],
      providers: fixtures, controllers: [TestPreparation],
    }).overrideProvider(AiAuditService).useValue({ recordToolExecution: vi.fn() }).compile();
    app = mod.createNestApplication();
    setupApp(app);
    await app.init();
    for (const type of fixtures) vi.spyOn(app.get(type), 'execute');
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
    ['uu/bad', 'patch', '/users/bad', {}, 401, 'none'],
    ['cd/missing', 'delete', '/companies/missing', {}, 401, 'invalid'],
    ['uu/' + missing, 'patch', '/users/' + missing, { role: 'invalid' }, 403, 'member'],
    ['uc', 'post', '/users', {}, 400],
    ['uc', 'post', '/users', { ...user, isAdmin: true }, 400],
    ['uc', 'post', '/users', { ...user, email: '  ' + user.email.toUpperCase() + ' ' }, 409],
    ['uu/bad', 'patch', '/users/bad', { status: 'inactive' }, 400],
    ['uu/bad', 'patch', '/users/bad', { status: null }, 400],
    ['uu/' + member, 'patch', '/users/' + member, { role: 'Invalid', status: null }, 400],
    ['uu/' + member, 'patch', '/users/' + member, {}, 400],
    ['uu/' + member, 'patch', '/users/' + member, { email: user.email }, 409],
    ['uu/' + admin, 'patch', '/users/' + admin, { status: 'inactive' }, 403],
    ['uu/' + missing, 'patch', '/users/' + missing, { name: 'X' }, 404],
    ['ud/' + admin, 'delete', '/users/' + admin, {}, 403],
    ['ud/' + referenced, 'delete', '/users/' + referenced, {}, 409],
    ['ub', 'post', '/users/bulk-delete', { ids: [member, referenced] }, 409],
    ['ub', 'post', '/users/bulk-delete', { ids: [member, member] }, 400],
    ['ub', 'post', '/users/bulk-delete', { ids: [] }, 400],
    ['ub', 'post', '/users/bulk-delete', { ids: ['bad'] }, 400],
    ['ub', 'post', '/users/bulk-delete', { ids: Array.from({ length: 101 }, () => randomUUID()) }, 400],
    ['ub', 'post', '/users/bulk-delete', { ids: [member, missing] }, 404],
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
    expect(preview).not.toHaveBeenCalled();
    for (const type of fixtures) expect(app.get(type).execute).not.toHaveBeenCalled();
    expect(await snapshot()).toEqual(before);
  });

  it('七种合法操作均可预览，业务表与更新时间逐行一致', async () => {
    const before = await snapshot();
    for (const [name, args] of [
      ['uc', { ...user, email: missing + '@example.test' }], ['uu/' + member, { email: member + '@example.test' }],
      ['ud/' + member, {}], ['ub', { ids: [member] }], ['cc', { ...company, companyCode: code + '-new' }],
      ['cu/' + free, { level: 4 }], ['cd/' + free, {}],
    ] as const) {
      await request(app.getHttpServer()).post('/test-prevalidation/' + name).auth(adminToken, { type: 'bearer' }).send(args).expect(201);
      expect(await snapshot()).toEqual(before);
    }
    expect(preview).toHaveBeenCalledTimes(7);
  });
});
