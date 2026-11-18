import 'reflect-metadata';
import { Body, Controller, Inject, Post, Req, UnauthorizedException, UseGuards, type INestApplication } from '@nestjs/common';
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
        .set('X-Forwarded-For', '192.0.2.1').send({ roles: 'Analyst,Member' }).expect(201, '7');
      expect(list).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ roles: ['Analyst', 'Member'], page: 1, pageSize: 10 }));
      const context = execute.mock.calls[0][0];
      expect(context).toMatchObject({ userId: id, isAdmin: true, ip: expect.stringMatching(/^(::1|(::ffff:)?127\.0\.0\.1)$/) });
      expect(Object.isFrozen(context)).toBe(true);
      await expect(tool.execute({ ...context! }, {})).rejects.toBeInstanceOf(UnauthorizedException);
      expect(list).toHaveBeenCalledTimes(1);
    } finally {
      execute.mockRestore();
    }
  });

  it('缺少或伪造的上下文均被拒绝', async () => {
    await expect(tool.execute(undefined, {})).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(tool.execute({ userId: id, isAdmin: true, ip: '127.0.0.1' }, {})).rejects.toBeInstanceOf(UnauthorizedException);
    await request(app.getHttpServer()).post('/example').send({}).expect(401);
    expect(list).not.toHaveBeenCalled();
  });

  it('当前账号权限优先于 JWT 中的角色声明', async () => {
    findById.mockResolvedValue({ id, role: 'Manager', isAdmin: false, status: 'active' });
    await request(app.getHttpServer()).post('/example').auth(token, { type: 'bearer' }).send({}).expect(403);
    findById.mockResolvedValue({ id, isAdmin: true, status: 'inactive' });
    await request(app.getHttpServer()).post('/example').auth(token, { type: 'bearer' }).send({}).expect(401);
    expect(list).not.toHaveBeenCalled();
  });

  it.each([{ userId: id }, { isAdmin: true }, { ip: '192.0.2.1' }, { context: { userId: id } }, { pageSize: 101 }])(
    '拒绝身份覆盖或非法业务参数 %j', async args => {
      await request(app.getHttpServer()).post('/example').auth(token, { type: 'bearer' }).send(args).expect(400);
      expect(list).not.toHaveBeenCalled();
    },
  );
});
