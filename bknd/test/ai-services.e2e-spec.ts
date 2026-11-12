import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { AI_DATA_SOURCE } from '../src/ai/ai.constants.js';
import { AiSessionService } from '../src/ai/services/ai-session.service.js';
import { AiMemoryService } from '../src/ai/services/ai-memory.service.js';
import { AiTaskService } from '../src/ai/services/ai-task.service.js';
import { AiAuditService } from '../src/ai/services/ai-audit.service.js';
import { AiOperationAuditEntity } from '../src/ai/entities/ai-operation-audit.entity.js';
import { UsersService } from '../src/users/users.service.js';
import { PG_POOL } from '../src/database/database.module.js';
import type { CreateAiMemoryDto } from '../src/ai/dto/ai-memory.dto.js';
import type { CreateAiTaskDto } from '../src/ai/dto/ai-task.dto.js';
import type { CreateAiAuditDto, QueryAiAuditDto } from '../src/ai/dto/ai-audit.dto.js';

const paging = { page: 1, pageSize: 10 };

describe('AI Service 数据访问与隔离 (真实 PostgreSQL)', () => {
  let moduleRef: TestingModule;
  let pool: pg.Pool;
  let dataSource: DataSource;
  let sessions: AiSessionService;
  let memories: AiMemoryService;
  let tasks: AiTaskService;
  let firstUser: string;
  let secondUser: string;
  let admin: string;
  const ids: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.init();
    pool = moduleRef.get(PG_POOL);
    dataSource = moduleRef.get(getDataSourceToken(AI_DATA_SOURCE));
    sessions = moduleRef.get(AiSessionService);
    memories = moduleRef.get(AiMemoryService);
    tasks = moduleRef.get(AiTaskService);
    // 验证审计 Service 也已通过模块注册；写审计的用例在可回滚事务中运行。
    expect(moduleRef.get(AiAuditService)).toBeInstanceOf(AiAuditService);
    for (const isAdmin of [false, false, true]) {
      const { rows } = await pool.query<{ id: string }>(
        'INSERT INTO users(email,password_hash,is_admin) VALUES ($1,$2,$3) RETURNING id',
        [`ai-service-${randomUUID()}@example.test`, '$argon2id$fixture', isAdmin],
      );
      ids.push(rows[0].id);
    }
    [firstUser, secondUser, admin] = ids;
  });

  afterAll(async () => {
    try {
      if (pool && ids.length) {
        // 只清理由本测试用户创建的数据；审计测试自身事务回滚。
        await pool.query('DELETE FROM ai_chat_session WHERE id IN (SELECT id FROM ai_chat_sessions WHERE user_id=ANY($1::uuid[]))', [ids]);
        await pool.query('DELETE FROM ai_chat_attachments WHERE message_id IN (SELECT m.id FROM ai_chat_messages m JOIN ai_chat_sessions s ON s.id=m.session_id WHERE s.user_id=ANY($1::uuid[]))', [ids]);
        await pool.query('DELETE FROM ai_chat_turns WHERE session_id IN (SELECT id FROM ai_chat_sessions WHERE user_id=ANY($1::uuid[]))', [ids]);
        await pool.query('DELETE FROM ai_chat_messages WHERE session_id IN (SELECT id FROM ai_chat_sessions WHERE user_id=ANY($1::uuid[]))', [ids]);
        await pool.query('DELETE FROM ai_chat_sessions WHERE user_id=ANY($1::uuid[])', [ids]);
        await pool.query('DELETE FROM ai_user_memory WHERE user_id=ANY($1::uuid[])', [ids]);
        await pool.query('DELETE FROM ai_task_record WHERE user_id=ANY($1::uuid[])', [ids]);
        await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [ids]);
      }
    } finally { await moduleRef?.close(); }
  });

  it('会话创建、旧会话兼容、分页、状态筛选和用户隔离', async () => {
    const created = await sessions.create(firstUser, { title: '我的会话' });
    expect(created).toMatchObject({ userId: firstUser, title: '我的会话', status: 'active' });
    const extension = await pool.query('SELECT id FROM ai_chat_session WHERE id=$1', [created.id]);
    expect(extension.rowCount).toBe(1);
    const legacy = await pool.query<{ id: string }>('INSERT INTO ai_chat_sessions(user_id,title) VALUES ($1,$2) RETURNING id', [firstUser, '旧会话']);
    const legacyId = legacy.rows[0].id;
    expect(await sessions.get(firstUser, legacyId)).toMatchObject({ status: 'active', title: '旧会话' });
    expect((await pool.query('SELECT id FROM ai_chat_session WHERE id=$1', [legacyId])).rowCount).toBe(0);
    await expect(sessions.update(secondUser, legacyId, { status: 'closed' })).rejects.toBeInstanceOf(NotFoundException);
    expect((await pool.query('SELECT id FROM ai_chat_session WHERE id=$1', [legacyId])).rowCount).toBe(0);
    expect(await sessions.update(firstUser, legacyId, { status: 'closed' })).toMatchObject({ status: 'closed' });
    expect((await pool.query('SELECT status FROM ai_chat_session WHERE id=$1', [legacyId])).rows[0].status).toBe('closed');
    const closed = await sessions.list(firstUser, { ...paging, status: 'closed' });
    expect(closed.items.map((row) => row.id)).toContain(legacyId);
    expect(closed.items.map((row) => row.id)).not.toContain(created.id);
    const firstPage = await sessions.list(firstUser, { page: 1, pageSize: 1 });
    const secondPage = await sessions.list(firstUser, { page: 2, pageSize: 1 });
    expect(firstPage).toMatchObject({ page: 1, pageSize: 1, hasMore: true });
    expect(secondPage.items[0].id).not.toBe(firstPage.items[0].id);
    expect((await sessions.list(secondUser, paging)).items).toEqual([]);
    await expect(sessions.get(secondUser, created.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(sessions.update(secondUser, created.id, { status: 'closed' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(sessions.remove(secondUser, created.id)).rejects.toBeInstanceOf(NotFoundException);
    expect((await sessions.get(firstUser, created.id)).status).toBe('active');
  });

  it('创建会话时扩展写入失败会回滚原会话', async () => {
    const before = await pool.query<{ count: string }>('SELECT count(*) FROM ai_chat_sessions WHERE user_id=$1', [firstUser]);
    const failure = vi.spyOn(Repository.prototype, 'insert').mockRejectedValueOnce(new Error('模拟扩展写入失败'));
    try {
      await expect(sessions.create(firstUser, { title: '事务回滚测试' })).rejects.toThrow('模拟扩展写入失败');
    } finally { failure.mockRestore(); }
    const after = await pool.query<{ count: string }>('SELECT count(*) FROM ai_chat_sessions WHERE user_id=$1', [firstUser]);
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });

  it('会话状态更新与现有聊天锁互斥；软删除保留消息', async () => {
    const session = await sessions.create(firstUser, {});
    const message = await pool.query<{ id: string }>(
      "INSERT INTO ai_chat_messages(session_id,role,content) VALUES ($1,'user',$2::jsonb) RETURNING id",
      [session.id, JSON.stringify({ text: '保留的消息' })],
    );
    const lockClient = await pool.connect();
    try {
      await lockClient.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [session.id]);
      await expect(sessions.update(firstUser, session.id, { status: 'closed' })).rejects.toBeInstanceOf(ConflictException);
      await expect(sessions.remove(firstUser, session.id)).rejects.toBeInstanceOf(ConflictException);
    } finally {
      await lockClient.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [session.id]);
      lockClient.release();
    }
    expect(await sessions.update(firstUser, session.id, { status: 'closed' })).toMatchObject({ status: 'closed' });
    expect(await sessions.remove(firstUser, session.id)).toEqual({ deleted: true });
    await expect(sessions.get(firstUser, session.id)).rejects.toBeInstanceOf(NotFoundException);
    expect((await pool.query('SELECT id FROM ai_chat_messages WHERE id=$1', [message.rows[0].id])).rowCount).toBe(1);
    expect((await pool.query('SELECT id FROM ai_chat_session WHERE id=$1', [session.id])).rowCount).toBe(1);
  });

  it('记忆 CRUD 使用可信用户 ID，按用户隔离并分页', async () => {
    const one = await memories.create(firstUser, { content: '第一条', userId: secondUser } as CreateAiMemoryDto);
    const two = await memories.create(firstUser, { content: '第二条' });
    expect(one.userId).toBe(firstUser);
    expect((await memories.list(firstUser, { page: 1, pageSize: 1 })).hasMore).toBe(true);
    expect((await memories.list(secondUser, paging)).items).toEqual([]);
    await expect(memories.get(secondUser, one.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(memories.update(secondUser, one.id, { content: '越权' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(memories.remove(secondUser, one.id)).rejects.toBeInstanceOf(NotFoundException);
    expect((await memories.update(firstUser, one.id, { content: '已更新' })).content).toBe('已更新');
    expect(await memories.remove(firstUser, two.id)).toEqual({ deleted: true });
    await expect(memories.get(firstUser, two.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('任务 CRUD 支持状态筛选，不接受其他用户修改', async () => {
    const task = await tasks.create(firstUser, { name: '任务一', userId: secondUser } as CreateAiTaskDto);
    await tasks.create(firstUser, { name: '任务二' });
    expect(task).toMatchObject({ userId: firstUser, status: 'pending' });
    expect((await tasks.list(firstUser, { page: 1, pageSize: 1 })).hasMore).toBe(true);
    expect((await tasks.list(secondUser, paging)).items).toEqual([]);
    await expect(tasks.get(secondUser, task.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(tasks.update(secondUser, task.id, { status: 'running' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(tasks.remove(secondUser, task.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(tasks.update(firstUser, task.id, {})).rejects.toBeInstanceOf(BadRequestException);
    expect(await tasks.update(firstUser, task.id, { name: '修改后', status: 'running' })).toMatchObject({ name: '修改后', status: 'running' });
    expect((await tasks.list(firstUser, { ...paging, status: 'running' })).items.map((row) => row.id)).toEqual([task.id]);
    expect(await tasks.remove(firstUser, task.id)).toEqual({ deleted: true });
    await expect(tasks.get(firstUser, task.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('缺失身份或资源 ID 时安全拒绝，不会扩大 ORM 查询范围', async () => {
    const missing = undefined as unknown as string;
    const id = randomUUID();
    const audit = moduleRef.get(AiAuditService);
    await expect(sessions.list(missing, paging)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(memories.list(missing, paging)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(tasks.get(missing, id)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(audit.listMine(missing, paging)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(audit.listAll(missing, paging)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(memories.get(firstUser, missing)).rejects.toBeInstanceOf(NotFoundException);
    await expect(tasks.remove(firstUser, missing)).rejects.toBeInstanceOf(NotFoundException);
    await expect(sessions.update(firstUser, missing, { status: 'closed' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(audit.getMine(firstUser, missing)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('审计只创建和查询；普通用户隔离，管理员权限按数据库最新状态确认', async () => {
    // 审计禁止 DELETE，所有测试记录通过事务回滚清理，不污染开发库。
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    const audit = new AiAuditService(runner.manager.getRepository(AiOperationAuditEntity), moduleRef.get(UsersService));
    try {
      const mine = await audit.create(firstUser, {
        action: 'task.create', resourceType: 'task', result: 'success', userId: secondUser,
      } as CreateAiAuditDto);
      const mineAgain = await audit.create(firstUser, { action: 'task.read', resourceType: 'task', result: 'success' });
      const other = await audit.create(secondUser, { action: 'task.read', resourceType: 'task', result: 'failure' });
      expect(mine.userId).toBe(firstUser);
      const ownList = await audit.listMine(firstUser, { ...paging, userId: secondUser } as QueryAiAuditDto);
      expect(ownList.items.map((row) => row.id)).toEqual(expect.arrayContaining([mine.id, mineAgain.id]));
      expect(ownList.items).toHaveLength(2);
      const firstAuditPage = await audit.listMine(firstUser, { page: 1, pageSize: 1 });
      const secondAuditPage = await audit.listMine(firstUser, { page: 2, pageSize: 1 });
      expect(firstAuditPage.hasMore).toBe(true);
      expect(secondAuditPage.items[0].id).not.toBe(firstAuditPage.items[0].id);
      expect((await audit.getMine(firstUser, mine.id)).id).toBe(mine.id);
      await expect(audit.getMine(firstUser, other.id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(audit.listAll(firstUser, paging)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(audit.getAsAdmin(firstUser, other.id)).rejects.toBeInstanceOf(ForbiddenException);
      const from = new Date(Date.now() - 60000).toISOString();
      const to = new Date(Date.now() + 60000).toISOString();
      const all = await audit.listAll(admin, { page: 1, pageSize: 100, from, to });
      expect(all.items.map((row) => row.id)).toEqual(expect.arrayContaining([mine.id, other.id]));
      const adminList = await audit.listAll(admin, { ...paging, userId: secondUser, result: 'failure', from, to });
      expect(adminList.items.map((row) => row.id)).toEqual([other.id]);
      expect((await audit.getAsAdmin(admin, other.id)).id).toBe(other.id);
      expect('update' in audit).toBe(false);
      expect('remove' in audit).toBe(false);
      await pool.query('UPDATE users SET is_admin=false WHERE id=$1', [admin]);
      await expect(audit.listAll(admin, paging)).rejects.toBeInstanceOf(ForbiddenException);
      await pool.query('UPDATE users SET is_admin=true,status=$2 WHERE id=$1', [admin, 'inactive']);
      await expect(audit.getAsAdmin(admin, mine.id)).rejects.toBeInstanceOf(ForbiddenException);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
