import { Body, Controller, Get, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  @Post()
  run(@Req() req: ToolRequest, @Body() args: unknown) { return this.registry.execute(name, req.toolContext, args); }
}

it('已发现的工具在 Redis 禁用后立即拒绝调用，重新启用后通过原业务 Service 查询', async () => {
  const id = randomUUID();
  const mod = await Test.createTestingModule({ imports: [AppModule, AiToolsModule, CompaniesModule, UsersModule, AuthModule],
    controllers: [RegistryController], providers: [IntegrationTool] })
    .overrideProvider(UsersService).useValue({ findById: async () => ({ id, isAdmin: false, status: 'active' }) }).compile();
  const app = mod.createNestApplication();
  const redis = createClient({ url: mod.get(ConfigService).get<string>('REDIS_URL') ?? 'redis://127.0.0.1:16379/0' });
  const query = vi.spyOn(mod.get(CompaniesService), 'list');
  try {
    await app.init();
    await redis.connect();
    const auth = { Authorization: 'Bearer ' + await mod.get(JwtService).signAsync({ sub: id }) };
    const http = request(app.getHttpServer());
    const candidates = async () => (await http.get('/registry-test').set(auth).expect(200)).body.map((row: { name: string }) => row.name);
    expect(await candidates()).toContain(name);
    await redis.hSet('ai:tools:enabled', name, '0');
    expect(await candidates()).not.toContain(name);
    expect((await http.post('/registry-test').set(auth).send({}).expect(201)).body.code).toBe('TOOL_UNAVAILABLE');
    expect(query).not.toHaveBeenCalled();
    await redis.hSet('ai:tools:enabled', name, '1');
    expect(await candidates()).toContain(name);
    const result = await http.post('/registry-test').set(auth).send({ search: name }).expect(201);
    expect(result.body).toMatchObject({ code: 'OK', data: { tableType: 'companies', items: [], total: 0 } });
    expect(query).toHaveBeenCalledTimes(1);
  } finally {
    query.mockRestore();
    try { if (redis.isReady) await redis.hDel('ai:tools:enabled', name); }
    finally { if (redis.isOpen) redis.destroy(); await app.close(); }
  }
});
