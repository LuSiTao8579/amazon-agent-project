import { Body, Controller, Get, Inject, Post, Param, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource, IsNull, type QueryRunner } from 'typeorm';
import pg from 'pg';
import { PG_POOL } from '../src/database/database.module.js';
import { AiAuditService } from '../src/ai/services/ai-audit.service.js';
import { AiOperationAuditEntity } from '../src/ai/entities/ai-operation-audit.entity.js';
import { AI_DATA_SOURCE } from '../src/ai/ai.constants.js';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createClient } from '@redis/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { vi } from 'vitest';
import { AiToolsModule } from '../src/ai/tools/ai-tools.module.js';
import { QueryCompaniesTool } from '../src/ai/tools/business-tools.js';
import { ToolRegistryService } from '../src/ai/tools/tool-registry.service.js';
import { Tool } from '../src/ai/tools/tool.decorator.js';
import { AppModule } from '../src/app.module.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { CompaniesModule } from '../src/companies/companies.module.js';
import { CompaniesService } from '../src/companies/companies.service.js';
import { JwtAuthGuard, type ToolRequest } from '../src/jwt-auth.guard.js';
import { UsersModule } from '../src/users/users.module.js';
import { UsersService } from '../src/users/users.service.js';

const name = 'test_companies_' + randomUUID().replaceAll('-', '');
@Tool({ name, description: '隔离验收工具', intent: 'QUERY_DATA', permission: 'companies.read' })
class IntegrationTool extends QueryCompaniesTool {}

// 外部模块新增 provider，沿测试应用的 HTTP / JWT / 注册中心路径执行。
@Controller('registry-test')
@UseGuards(JwtAuthGuard)
class RegistryController {
  constructor(@Inject(ToolRegistryService) private readonly registry: ToolRegistryService) {}
  @Get()
  list(@Req() req: ToolRequest) { return this.registry.listByIntent('QUERY_DATA', req.toolContext!); }
  @Post(':tool')
  run(@Param('tool') tool: string, @Req() req: ToolRequest, @Body() args: unknown) { return this.registry.execute(tool, req.toolContext, args); }
}

it('工具执行和各类拒绝均写入脱敏审计，按当前用户和管理员范围回读', async () => {
  const id = randomUUID();
  const adminId = randomUUID();
  let runner!: QueryRunner;
  const mod = await Test.createTestingModule({ imports: [AppModule, AiToolsModule, CompaniesModule, UsersModule, AuthModule],
    controllers: [RegistryController], providers: [IntegrationTool] })
    .overrideProvider(AiAuditService).useFactory({
      inject: [getDataSourceToken(AI_DATA_SOURCE), UsersService],
      factory: async (db: DataSource, users: UsersService) => {
        runner = db.createQueryRunner();
        await runner.startTransaction();
        return new AiAuditService(runner.manager.getRepository(AiOperationAuditEntity), users);
      },
    }).compile();
  const pool = mod.get<pg.Pool>(PG_POOL);
  const app = mod.createNestApplication();
  const redis = createClient({ url: mod.get(ConfigService).get<string>('REDIS_URL') ?? 'redis://127.0.0.1:16379/0' });
  const query = vi.spyOn(mod.get(CompaniesService), 'list');
  try {
    await app.init();
    await redis.connect();
    for (const actor of [id, adminId]) {
      await pool.query('INSERT INTO users(id,email,password_hash,is_admin) VALUES ($1,$2,$3,$4)',
        [actor, actor + '@example.test', '$argon2id$fixture', actor === adminId]);
    }
    await pool.query(`INSERT INTO companies(company_code,company_name,level,country,city,founded_year,annual_revenue,employees)
      VALUES ($1,$1,1,'UK','London',2020,98765,5)`, [name]);
    const admin = { Authorization: 'Bearer ' + await mod.get(JwtService).signAsync({ sub: adminId }) };
    const auth = { Authorization: 'Bearer ' + await mod.get(JwtService).signAsync({ sub: id }) };
    const http = request(app.getHttpServer());
    const candidates = async () => (await http.get('/registry-test').set(auth).expect(200)).body.map((row: { name: string }) => row.name);
    expect(await candidates()).toContain(name);
    await redis.hSet('ai:tools:enabled', name, '0');
    expect(await candidates()).not.toContain(name);
    expect((await http.post('/registry-test/' + name).set(auth).send({}).expect(201)).body.code).toBe('TOOL_UNAVAILABLE');
    expect(query).not.toHaveBeenCalled();
    await redis.hSet('ai:tools:enabled', name, '1');
    expect(await candidates()).toContain(name);
    const result = await http.post('/registry-test/' + name).set(auth).set('X-Forwarded-For', '192.0.2.9').send({ search: name, pageSize: 10 }).expect(201);
    expect(result.body).toMatchObject({ code: 'OK', data: { tableType: 'companies', items: [{ annualRevenue: 98765, revenuePerEmployee: 19753 }], total: 1 } });
    expect(query).toHaveBeenCalledTimes(1);
    const nested = { filters: [{ email: 'secret@example.test', phone: '+44 7700 900123',
      metrics: { annualRevenue: 98765, revenuePerEmployee: 19753, totalRevenue: 987650 } }] };
    expect((await http.post('/registry-test/' + name).set(auth).send(nested)).body.code).toBe('INVALID_ARGUMENTS');
    expect((await http.post('/registry-test/query_users').set(auth).send({})).body.code).toBe('FORBIDDEN');
    query.mockRejectedValueOnce(new Error('private database error'));
    expect((await http.post('/registry-test/' + name).set(auth).send({})).body.code).toBe('EXECUTION_FAILED');

    const mine = await http.get('/ai/audits').set(auth).expect(200);
    expect(mine.body.items).toHaveLength(5);
    const records = mine.body.items as AiOperationAuditEntity[];
    const codes = records.map(row => row.resultSummary!.code).sort();
    expect(codes).toEqual(['EXECUTION_FAILED', 'FORBIDDEN', 'INVALID_ARGUMENTS', 'OK', 'TOOL_UNAVAILABLE']);
    for (const row of records) {
      expect(row.userId).toBe(id);
      expect(row.resourceType).toBe('tool');
      expect(row.ip).toMatch(/^(::1|(::ffff:)?127\.0\.0\.1)$/);
      expect(Date.parse(String(row.createdAt))).toBeGreaterThan(0);
      expect(row.result).toBe(row.resultSummary!.code === 'OK' ? 'success' : 'failure');
    }
    const ok = records.find(row => row.result === 'success')!;
    expect(ok).toMatchObject({ toolName: name, action: 'companies.read', inputParams: { search: '[REDACTED]', pageSize: 10 },
      resultSummary: { code: 'OK', resultType: 'table', returnedCount: 1, total: 1 } });
    const invalid = records.find(row => row.resultSummary?.code === 'INVALID_ARGUMENTS')!;
    expect(invalid.inputParams).toEqual({ filters: [{ email: '[REDACTED]', phone: '[REDACTED]',
      metrics: { annualRevenue: '[REDACTED]', revenuePerEmployee: '[REDACTED]', totalRevenue: '[REDACTED]' } }] });
    expect(records.find(row => row.resultSummary?.code === 'FORBIDDEN')).toMatchObject({ toolName: 'query_users', action: 'users.read' });
    const storedPayloads = JSON.stringify(records.map(row => [row.inputParams, row.resultSummary]));
    for (const privateValue of ['secret@example.test', '7700', '98765', '19753', 'private database error']) {
      expect(storedPayloads).not.toContain(privateValue);
    }
    await http.get('/ai/admin/audits').set(auth).expect(403);
    await http.get('/ai/audits/' + ok.id).set(admin).expect(404);
    const all = await http.get('/ai/admin/audits').query({ userId: id }).set(admin).expect(200);
    expect(all.body.items).toEqual(mine.body.items);

    const registry = mod.get(ToolRegistryService);
    await registry.execute(name, { userId: id, isAdmin: true, ip: '192.0.2.9' }, {});
    const anonymous = await runner.manager.getRepository(AiOperationAuditEntity).findOneByOrFail({
      toolName: name, action: 'companies.read', userId: IsNull(), result: 'failure',
    });
    expect(anonymous).toMatchObject({ ip: null, resultSummary: { code: 'UNAUTHENTICATED' } });

  } finally {
    query.mockRestore();
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await pool.query('DELETE FROM companies WHERE company_code = $1', [name]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[id, adminId]]);
    try { if (redis.isReady) await redis.hDel('ai:tools:enabled', name); }
    finally { if (redis.isOpen) redis.destroy(); await app.close(); }
  }
});
