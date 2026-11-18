import 'reflect-metadata';
import { Body, Controller, Inject, Module, Post, Req, ServiceUnavailableException, UseGuards, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthModule } from '../../auth/auth.module.js';
import { JwtAuthGuard, type ToolRequest } from '../../jwt-auth.guard.js';
import { UserManagementService } from '../../users/user-management.service.js';
import { UsersService } from '../../users/users.service.js';
import { UsersModule } from '../../users/users.module.js';
import { CompaniesService } from '../../companies/companies.service.js';
import { DashboardService } from '../../dashboard/dashboard.service.js';
import { AiCacheService } from '../cache/ai-cache.service.js';
import { ToolRegistryService } from './tool-registry.service.js';
import { AiAuditModule } from '../ai-audit.module.js';
import { AiAuditService } from '../services/ai-audit.service.js';
import { AiToolsModule } from './ai-tools.module.js';
import { toolFailure } from './tool-result.js';
import { ExampleCountUsersTool } from './example-count-users.tool.js';

// 仅在测试应用暴露入口，沿实际 JWT Guard、模块注入和工具执行路径验收。
@Controller('example')
@UseGuards(JwtAuthGuard)
class ExampleController {
  constructor(@Inject(ExampleCountUsersTool) private readonly tool: ExampleCountUsersTool) {}

  @Post()
  execute(@Req() req: ToolRequest, @Body() args: unknown) {
    return this.tool.execute(req.toolContext, args);
  }
}

const recordToolExecution = vi.fn().mockResolvedValue(undefined);
@Module({ providers: [{ provide: AiAuditService, useValue: { recordToolExecution } }], exports: [AiAuditService] })
class TestAuditModule {}

describe('工具身份与业务参数', () => {
  const id = randomUUID();
  const findById = vi.fn();
  const switches = new Map<string, boolean>();
  const isToolEnabled = vi.fn(async (name: string, fallback: boolean) => switches.get(name) ?? fallback);
  const companies = { list: vi.fn().mockResolvedValue({ total: 0, items: [], page: 1, pageSize: 10 }) };
  const dashboard = { getDashboard: vi.fn().mockResolvedValue({ summary: {}, levelDistribution: [], yearlyGrowth: [] }) };
  let registry: ToolRegistryService;
  const list = vi.fn().mockResolvedValue({ total: 7 });
  let app: INestApplication;
  let token: string;
  let tool: ExampleCountUsersTool;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ JWT_SECRET: randomUUID() })] }),
        AiToolsModule, AuthModule, UsersModule,
      ],
      controllers: [ExampleController],
    }).overrideModule(AiAuditModule).useModule(TestAuditModule).overrideProvider(UsersService).useValue({ findById })
      .overrideProvider(AiCacheService).useValue({ isToolEnabled })
      .overrideProvider(CompaniesService).useValue(companies)
      .overrideProvider(DashboardService).useValue(dashboard)
      .overrideProvider(UserManagementService).useValue({ list }).compile();
    app = module.createNestApplication();
    await app.init();
    registry = app.get(ToolRegistryService);
    tool = app.get(ExampleCountUsersTool);
    token = await app.get(JwtService).signAsync({ sub: id, isAdmin: true });
  });

  beforeEach(() => {
    switches.clear();
    switches.set('example_count_users', true);
    vi.clearAllMocks();
    findById.mockResolvedValue({ id, isAdmin: true, status: 'active' });
  });
  afterAll(async () => { await app?.close(); });

  it('管理员可查询，分页默认值、岗位转换及连接 IP 来自各自的可信来源', async () => {
    const execute = vi.spyOn(tool, 'execute');
    try {
      await request(app.getHttpServer()).post('/example').auth(token, { type: 'bearer' })
        .set('X-Forwarded-For', '192.0.2.1').send({ roles: 'Analyst,Member' }).expect(201, { code: 'OK', resultType: 'text', data: { text: '匹配用户数为 7。' }, message: '查询成功。' });
      expect(list).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ roles: ['Analyst', 'Member'], page: 1, pageSize: 10 }));
      const context = execute.mock.calls[0][0];
      expect(context).toMatchObject({ userId: id, isAdmin: true, ip: expect.stringMatching(/^(::1|(::ffff:)?127\.0\.0\.1)$/) });
      expect(Object.isFrozen(context)).toBe(true);
      await expect(tool.execute({ ...context! }, {})).resolves.toEqual(toolFailure('UNAUTHENTICATED'));
      expect(list).toHaveBeenCalledTimes(1);
    } finally {
      execute.mockRestore();
    }
  });

  async function issuedContext() {
    const execute = vi.spyOn(tool, 'execute');
    try {
      await request(app.getHttpServer()).post('/example').auth(token, { type: 'bearer' }).send({}).expect(201);
      return execute.mock.calls[0][0]!;
    } finally {
      execute.mockRestore();
      list.mockClear();
      switches.delete('example_count_users');
    }
  }

  it('按名称及意图发现工具，已选中的工具在禁用后拒绝执行，恢复后可查', async () => {
    const context = await issuedContext();
    const candidates = await registry.listByIntent('QUERY_DATA', context);
    expect(candidates.map(tool => tool.name).sort()).toEqual(['query_companies', 'query_users']);
    expect((await registry.listByIntent('STATISTICS_ANALYSIS', context)).map(tool => tool.name)).toEqual(['dashboard_metrics']);
    const company = await registry.findByName('query_companies', context);
    expect(company?.permission).toBe('companies.read');
    switches.set('query_companies', false);
    expect(await registry.findByName('query_companies', context)).toBeUndefined();
    expect((await registry.listByIntent('QUERY_DATA', context)).map(tool => tool.name)).toEqual(['query_users']);
    expect(await registry.execute(company!.name, context, {})).toEqual(toolFailure('TOOL_UNAVAILABLE'));
    expect(companies.list).not.toHaveBeenCalled();
    switches.set('query_companies', true);
    expect(await registry.execute(company!.name, context, { pageSize: 101 })).toMatchObject({ code: 'INVALID_ARGUMENTS' });
    expect(companies.list).not.toHaveBeenCalled();
    expect(await registry.execute(company!.name, context, {})).toMatchObject({ code: 'OK', data: { tableType: 'companies' } });
    expect(companies.list).toHaveBeenCalledTimes(1);
    expect(await registry.execute('dashboard_metrics', context, { country: 'UK' })).toMatchObject({ code: 'INVALID_ARGUMENTS' });
    expect(dashboard.getDashboard).not.toHaveBeenCalled();
    expect(await registry.execute('dashboard_metrics', context, {})).toMatchObject({ code: 'OK', resultType: 'report' });
    expect(await registry.execute('unknown', context, {})).toEqual(toolFailure('TOOL_UNAVAILABLE'));
  });

  it('发现后管理员权限被撤销或账号被停用，同一上下文也不能继续读取', async () => {
    const context = await issuedContext();
    expect(await registry.findByName('query_users', context)).toBeDefined();
    list.mockResolvedValueOnce({ items: [{ name: '示例', email: 'demo@example.test', role: 'Member', status: 'active', isAdmin: true }],
      total: 1, page: 1, pageSize: 10 });
    expect((await registry.execute('query_users', context, {})).data).toEqual({ tableType: 'users', total: 1, page: 1, pageSize: 10,
      items: [{ name: '示例', email: 'demo@example.test', role: 'Member', status: 'active' }] });
    list.mockClear();
    findById.mockResolvedValue({ id, status: 'active', isAdmin: false });
    expect((await registry.listByIntent('QUERY_DATA', context)).map(tool => tool.name)).toEqual(['query_companies']);
    expect(await registry.execute('query_users', context, {})).toEqual(toolFailure('FORBIDDEN'));
    expect(list).not.toHaveBeenCalled();
    findById.mockResolvedValue({ id, status: 'inactive', isAdmin: true });
    expect(await registry.execute('query_companies', context, {})).toEqual(toolFailure('UNAUTHENTICATED'));
    expect(companies.list).not.toHaveBeenCalled();
  });

  it('开关读取故障时返回不可用，未调用业务查询', async () => {
    const context = await issuedContext();
    isToolEnabled.mockRejectedValueOnce(new ServiceUnavailableException());
    expect(await registry.execute('query_companies', context, {})).toEqual(toolFailure('TOOL_UNAVAILABLE'));
    expect(companies.list).not.toHaveBeenCalled();
  });

  it('直接调用教学工具也只审计一次，写入失败时不交付查询数据', async () => {
    recordToolExecution.mockRejectedValueOnce(new Error('database unavailable'));
    await request(app.getHttpServer()).post('/example').auth(token, { type: 'bearer' }).send({})
      .expect(201, toolFailure('EXECUTION_FAILED'));
    expect(recordToolExecution).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('缺少或伪造的上下文均被拒绝', async () => {
    await expect(tool.execute(undefined, {})).resolves.toEqual(toolFailure('UNAUTHENTICATED'));
    await expect(tool.execute({ userId: id, isAdmin: true, ip: '127.0.0.1' }, {})).resolves.toEqual(toolFailure('UNAUTHENTICATED'));
    await request(app.getHttpServer()).post('/example').send({}).expect(401);
    expect(list).not.toHaveBeenCalled();
  });

  it('当前账号权限优先于 JWT 中的角色声明', async () => {
    findById.mockResolvedValue({ id, role: 'Manager', isAdmin: false, status: 'active' });
    await request(app.getHttpServer()).post('/example').auth(token, { type: 'bearer' }).send({}).expect(201, toolFailure('FORBIDDEN'));
    findById.mockResolvedValue({ id, isAdmin: true, status: 'inactive' });
    await request(app.getHttpServer()).post('/example').auth(token, { type: 'bearer' }).send({}).expect(401);
    expect(list).not.toHaveBeenCalled();
  });

  it('工具不可用时返回可展示的固定结果', async () => {
    list.mockRejectedValueOnce(new ServiceUnavailableException('private diagnostic'));
    await request(app.getHttpServer()).post('/example').auth(token, { type: 'bearer' }).send({})
      .expect(201, toolFailure('TOOL_UNAVAILABLE'));
  });

  it('业务异常的内部信息不会进入工具结果', async () => {
    list.mockRejectedValueOnce(new Error('private database diagnostic'));
    await request(app.getHttpServer()).post('/example').auth(token, { type: 'bearer' }).send({})
      .expect(201, toolFailure('EXECUTION_FAILED'));
  });

  it.each([{ userId: id }, { isAdmin: true }, { ip: '192.0.2.1' }, { context: { userId: id } }, { pageSize: 101 }, { page: 0 }, { sortBy: 'country' }, { sortOrder: 'up' }])(
    '拒绝身份覆盖或非法业务参数 %j', async args => {
      await request(app.getHttpServer()).post('/example').auth(token, { type: 'bearer' }).send(args)
        .expect(201).expect(({ body }) => {
          expect(body).toMatchObject({ code: 'INVALID_ARGUMENTS', resultType: 'text', data: null });
          const hint = 'sortBy' in args ? '排序字段' : 'sortOrder' in args ? '排序方向' :
            'pageSize' in args ? '每页条数' : 'page' in args ? '页码' : '不支持的参数';
          expect(body.message).toContain(hint);
        });
      expect(list).not.toHaveBeenCalled();
    },
  );
});
