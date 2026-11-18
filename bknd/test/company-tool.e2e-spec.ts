import { Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { UsersModule } from '../src/users/users.module.js';
import { UsersService } from '../src/users/users.service.js';
import { AiToolsModule } from '../src/ai/tools/ai-tools.module.js';
import { ToolRegistryService } from '../src/ai/tools/tool-registry.service.js';
import { AiAuditService } from '../src/ai/services/ai-audit.service.js';
import { JwtAuthGuard, type ToolRequest } from '../src/jwt-auth.guard.js';
import { PG_POOL } from '../src/database/database.module.js';

@Controller('test-company-tool')
@UseGuards(JwtAuthGuard)
class CompanyToolController {
  constructor(@Inject(ToolRegistryService) private readonly tools: ToolRegistryService) {}
  @Post()
  run(@Req() req: ToolRequest, @Body() args: unknown) {
    return this.tools.execute('query_companies', req.toolContext, args);
  }
}

it('公司工具和业务 API 在相同筛选和排序下逐页返回相同字段、总数和人均年营收', async () => {
  const id = randomUUID();
  const prefix = 'step6-' + id;
  // 隔离测试身份与只追加审计；公司 Service、数据库、注册中心、DTO 和 HTTP 守卫均走真实实现。
  const mod = await Test.createTestingModule({ imports: [AppModule, AiToolsModule, AuthModule, UsersModule],
    controllers: [CompanyToolController] })
    .overrideProvider(UsersService).useValue({ findById: async () => ({ id, status: 'active', isAdmin: false }) })
    .overrideProvider(AiAuditService).useValue({ recordToolExecution: async () => {} }).compile();
  const app = mod.createNestApplication();
  const pool = mod.get<pg.Pool>(PG_POOL);
  const fixtures = [
    ['a', 2, 'UK', 'London', 198, 2], ['b', 3, 'uk', 'london', 200, 2],
    ['c', 2, 'UK', 'LONDON', 1000, 2], ['d', 3, 'UK', 'London', 1234, 0],
    ['wrong-level', 4, 'UK', 'London', 10, 2], ['wrong-city', 2, 'UK', 'Londonderry', 10, 2],
    ['wrong-country', 2, 'CA', 'London', 10, 2], ['wrong-name', 2, 'UK', 'London', 10, 2],
  ] as const;
  try {
    await app.init();
    for (const [suffix, level, country, city, revenue, employees] of fixtures) {
      await pool.query(`INSERT INTO companies(company_code,company_name,level,country,city,founded_year,annual_revenue,employees)
        VALUES ($1,$2,$3,$4,$5,2001,$6,$7)`, [prefix + suffix, suffix === 'wrong-name' ? id : prefix,
        level, country, city, revenue, employees]);
    }
    const http = request(app.getHttpServer());
    const headers = { Authorization: 'Bearer ' + await mod.get(JwtService).signAsync({ sub: id }) };
    const query = { search: prefix, levels: [2, 3], country: ' UK ', city: ' LONDON ', sortBy: 'revenuePerEmployee', sortOrder: 'asc', pageSize: 2 };
    for (const [page, expected] of [[1, [99, 100]], [2, [500, null]], [3, []]] as const) {
      const api = await http.get('/companies').set(headers).query({ ...query, levels: '2,3', page }).expect(200);
      const tool = await http.post('/test-company-tool').set(headers).send({ ...query, page }).expect(201);
      const items = api.body.items.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...row }: Record<string, unknown>) => row);
      expect(tool.body).toMatchObject({ code: 'OK', resultType: 'table' });
      expect(tool.body.data).toEqual({ tableType: 'companies', items, total: 4, page, pageSize: 2 });
      expect(items.map((row: { revenuePerEmployee: number | null }) => row.revenuePerEmployee)).toEqual(expected);
      expect(api.body.total).toBe(4);
    }
    for (const filter of [{ city: 'Lon' }, { country: '%' }]) {
      const none = await http.post('/test-company-tool').set(headers).send({ ...query, ...filter }).expect(201);
      expect(none.body.data).toMatchObject({ items: [], total: 0 });
    }
    for (const args of [{ city: '   ' }, { country: ['UK'] }, { city: null }]) {
      expect((await http.post('/test-company-tool').set(headers).send(args)).body.code).toBe('INVALID_ARGUMENTS');
    }
  } finally {
    try { await pool.query('DELETE FROM companies WHERE company_code = ANY($1::text[])', [fixtures.map(([suffix]) => prefix + suffix)]); }
    finally { await app.close(); }
  }
});
