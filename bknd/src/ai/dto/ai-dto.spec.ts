import { BadRequestException, Body, Controller, Get, Post, Query, type INestApplication, type Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { aiDtoPipe } from './ai-dto.pipe.js';
import { setupApp } from '../../setup-app.js';
import { AiIdParamsDto } from './ai-common.dto.js';
import { CreateAiSessionDto, QueryAiSessionDto, UpdateAiSessionDto } from './ai-session.dto.js';
import { CreateAiMemoryDto, QueryAiMemoryDto, UpdateAiMemoryDto } from './ai-memory.dto.js';
import { CreateAiTaskDto, QueryAiTaskDto, UpdateAiTaskDto } from './ai-task.dto.js';
import { AdminQueryAiAuditDto, CreateAiAuditDto, QueryAiAuditDto } from './ai-audit.dto.js';

const uuid = '11111111-1111-4111-8111-111111111111';

async function parse<T extends object>(type: Type<T>, input: unknown, kind: 'body' | 'query' | 'param' = 'body'): Promise<T> {
  return await aiDtoPipe(type).transform(input, { type: kind, metatype: type }) as T;
}

// 仅存在于测试模块，不创建实际 AI 业务接口。
@Controller('__ai_dto_test')
class AiDtoTestController {
  @Post('session')
  session(@Body(aiDtoPipe(CreateAiSessionDto)) input: CreateAiSessionDto) { return input; }

  @Post('memory')
  memory(@Body(aiDtoPipe(CreateAiMemoryDto)) input: CreateAiMemoryDto) { return input; }

  @Get('tasks')
  tasks(@Query(aiDtoPipe(QueryAiTaskDto)) query: QueryAiTaskDto) { return query; }
}

describe('AI DTO 参数校验', () => {
  it('创建请求必须是 JSON 对象，而不是数组或标量', async () => {
    for (const input of [[], ['x'], 'text', 5, null]) {
      await expect(parse(CreateAiSessionDto, input)).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('会话创建使用已有标题，更新只接受有效状态', async () => {
    expect(await parse(CreateAiSessionDto, {})).toBeInstanceOf(CreateAiSessionDto);
    expect((await parse(CreateAiSessionDto, { title: '  我的会话  ' })).title).toBe('我的会话');
    expect((await parse(UpdateAiSessionDto, { status: 'closed' })).status).toBe('closed');
    for (const input of [{ title: '   ' }, { title: 'a\u0000b' }, { title: null }, { title: 'a'.repeat(201) }, { userId: uuid }]) {
      await expect(parse(CreateAiSessionDto, input)).rejects.toBeInstanceOf(BadRequestException);
    }
    for (const input of [{}, { status: null }, { status: 'deleted' }, { status: 'closed', userId: uuid }]) {
      await expect(parse(UpdateAiSessionDto, input)).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('记忆内容不能为空白、null 或超过数据库允许的长度', async () => {
    expect((await parse(CreateAiMemoryDto, { content: '  偏好中文\n' })).content).toBe('  偏好中文\n');
    expect((await parse(UpdateAiMemoryDto, { content: 'a'.repeat(10000) })).content).toHaveLength(10000);
    for (const type of [CreateAiMemoryDto, UpdateAiMemoryDto]) {
      for (const input of [{}, { content: null }, { content: 'x\u0000y' }, { content: '\n \t' }, { content: 'a'.repeat(10001) }, { content: 'ok', userId: uuid }]) {
        await expect(parse(type, input)).rejects.toBeInstanceOf(BadRequestException);
      }
    }
  });

  it('任务创建与更新校验名称、状态、空修改和非授权字段', async () => {
    expect((await parse(CreateAiTaskDto, { name: '  任务  ' })).name).toBe('任务');
    expect((await parse(UpdateAiTaskDto, { name: '  新名称  ' })).name).toBe('新名称');
    expect((await parse(UpdateAiTaskDto, { status: 'running' })).status).toBe('running');
    expect(await parse(UpdateAiTaskDto, { name: '任务', status: 'completed' })).toMatchObject({ name: '任务', status: 'completed' });
    for (const input of [{}, { name: null }, { name: 'a\u0000b' }, { name: '  ' }, { name: 'a'.repeat(201) }, { name: '任务', userId: uuid }, { name: '任务', status: 'running' }]) {
      await expect(parse(CreateAiTaskDto, input)).rejects.toBeInstanceOf(BadRequestException);
    }
    for (const input of [{}, { name: null }, { status: null }, { name: null, status: 'running' }, { name: '任务', status: null }, { status: 'unknown' }, { name: '任务', isAdmin: true }]) {
      await expect(parse(UpdateAiTaskDto, input)).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('四类分页查询设置默认值、转换数字并拒绝越界或异常格式', async () => {
    for (const type of [QueryAiSessionDto, QueryAiMemoryDto, QueryAiTaskDto, QueryAiAuditDto]) {
      expect(await parse(type, {}, 'query')).toMatchObject({ page: 1, pageSize: 10 });
      expect(await parse(type, { page: '2', pageSize: '100' }, 'query')).toMatchObject({ page: 2, pageSize: 100 });
      for (const query of [
        { page: '0' }, { page: '-1' }, { page: '1.5' }, { page: '1e2' }, { page: '' }, { page: ['1', '2'] },
        { page: '1000001' }, { pageSize: '0' }, { pageSize: '101' }, { pageSize: null }, { userId: uuid },
      ]) {
        await expect(parse(type, query, 'query')).rejects.toBeInstanceOf(BadRequestException);
      }
    }
    expect((await parse(QueryAiSessionDto, { status: 'active' }, 'query')).status).toBe('active');
    expect((await parse(QueryAiTaskDto, { status: 'failed' }, 'query')).status).toBe('failed');
    await expect(parse(QueryAiSessionDto, { status: 'running' }, 'query')).rejects.toBeInstanceOf(BadRequestException);
    await expect(parse(QueryAiTaskDto, { status: 'closed' }, 'query')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('资源 ID 和仅管理员可用的审计用户筛选需要有效 UUID', async () => {
    expect((await parse(AiIdParamsDto, { id: uuid }, 'param')).id).toBe(uuid);
    expect((await parse(AdminQueryAiAuditDto, { userId: uuid }, 'query')).userId).toBe(uuid);
    for (const id of ['not-uuid', '', null]) {
      await expect(parse(AiIdParamsDto, { id }, 'param')).rejects.toBeInstanceOf(BadRequestException);
      await expect(parse(AdminQueryAiAuditDto, { userId: id }, 'query')).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(parse(QueryAiAuditDto, { userId: uuid }, 'query')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('服务端审计字段与数据库约束一致，不接受伪造操作者', async () => {
    expect(await parse(CreateAiAuditDto, { action: ' read ', resourceType: ' task ', resourceId: null, result: 'success' }))
      .toMatchObject({ action: 'read', resourceType: 'task', resourceId: null, result: 'success' });
    expect((await parse(CreateAiAuditDto, { action: 'read', resourceType: 'task', resourceId: uuid, result: 'failure' })).resourceId).toBe(uuid);
    for (const input of [
      {}, { action: ' ', resourceType: 'task', result: 'success' },
      { action: 'a'.repeat(101), resourceType: 'task', result: 'success' },
      { action: 'a\u0000b', resourceType: 'task', result: 'success' },
      { action: 'read', resourceType: null, result: 'success' },
      { action: 'read', resourceType: 'a'.repeat(101), result: 'success' },
      { action: 'read', resourceType: 't\u0000x', result: 'success' },
      { action: 'read', resourceType: 'task', resourceId: 'bad', result: 'success' },
      { action: 'read', resourceType: 'task', result: 'unknown' },
      { action: 'read', resourceType: 'task', result: 'success', userId: uuid },
    ]) {
      await expect(parse(CreateAiAuditDto, input)).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('审计时间范围必须有时区、日期有效且先后顺序正确', async () => {
    expect(await parse(QueryAiAuditDto, {
      from: '2026-11-12T10:00:00+08:00', to: '2026-11-12T02:00:00Z', result: 'failure',
    }, 'query')).toMatchObject({ result: 'failure' });
    for (const query of [
      { from: '2026-11-12' }, { from: '2026-11-12T10:00:00' }, { from: '2026-02-30T10:00:00Z' },
      { to: null }, { to: '2026-11-12T25:00:00Z' },
      { from: '0000-01-01T00:00:00Z' }, { from: '2026-11-12T10:00:00+16:00' },
      { from: '2026-11-12T10:00:00Z', to: '2026-11-12T09:59:59Z' },
      { result: 'invalid' },
    ]) {
      await expect(parse(QueryAiAuditDto, query, 'query')).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});

describe('AI DTO 与 Nest HTTP 校验管道', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const fixture = await Test.createTestingModule({ controllers: [AiDtoTestController] }).compile();
    app = fixture.createNestApplication();
    setupApp(app);
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it('正常请求通过，错误请求返回 400 和清晰的字段提示', async () => {
    await request(app.getHttpServer()).post('/__ai_dto_test/memory').send({ content: '测试' }).expect(201);
    const bad = await request(app.getHttpServer()).post('/__ai_dto_test/memory').send({ content: '   ' }).expect(400);
    expect(bad.body.message).toContain('content 不能为空白');
    await request(app.getHttpServer()).get('/__ai_dto_test/tasks?page=2&pageSize=5').expect(200)
      .expect({ page: 2, pageSize: 5 });
    await request(app.getHttpServer()).get('/__ai_dto_test/tasks?pageSize=101').expect(400);
    await request(app.getHttpServer()).post('/__ai_dto_test/memory').send({ content: 'ok', userId: uuid }).expect(400);
    await request(app.getHttpServer()).post('/__ai_dto_test/memory').send([]).expect(400);
    await request(app.getHttpServer()).post('/__ai_dto_test/session').send([]).expect(400);
  });
});
