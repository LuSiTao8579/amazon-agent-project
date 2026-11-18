import 'reflect-metadata';
import { Body, Controller, Inject, Post, Req, ServiceUnavailableException, UseGuards, type INestApplication } from '@nestjs/common';
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

describe('工具身份与业务参数', () => {
  const id = randomUUID();
  const findById = vi.fn();
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
    }).overrideProvider(UsersService).useValue({ findById })
      .overrideProvider(UserManagementService).useValue({ list }).compile();
    app = module.createNestApplication();
    await app.init();
    tool = app.get(ExampleCountUsersTool);
    token = await app.get(JwtService).signAsync({ sub: id, isAdmin: true });
  });

  beforeEach(() => {
    list.mockClear();
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
