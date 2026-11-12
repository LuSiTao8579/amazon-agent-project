import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { AI_DATA_SOURCE, AI_ENTITIES } from '../src/ai/ai.module.js';
import { AI_AUDIT_RESULTS, AI_SESSION_STATUSES, AI_TASK_STATUSES } from '../src/ai/ai.constants.js';
import { AiChatSessionEntity } from '../src/ai/entities/ai-chat-session.entity.js';
import { AiOperationAuditEntity } from '../src/ai/entities/ai-operation-audit.entity.js';
import { AiTaskRecordEntity } from '../src/ai/entities/ai-task-record.entity.js';
import { AiUserMemoryEntity } from '../src/ai/entities/ai-user-memory.entity.js';

type Row = Record<string, unknown>;

describe('AI 数据表迁移 (真实 PostgreSQL)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let runner: QueryRunner;
  let userId: string;
  let sessionId: string;

  // 每个用例在独立事务中运行并回滚，包括只追加的审计记录。
  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.init();
    dataSource = moduleRef.get<DataSource>(getDataSourceToken(AI_DATA_SOURCE));
  });

  beforeEach(async () => {
    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    const users = await runner.query(
      'INSERT INTO users(email, password_hash) VALUES ($1, $2) RETURNING id',
      [`ai-schema-${randomUUID()}@example.test`, '$argon2id$fixture'],
    ) as Array<{ id: string }>;
    userId = users[0].id;
    const sessions = await runner.query(
      'INSERT INTO ai_chat_sessions(user_id) VALUES ($1) RETURNING id', [userId],
    ) as Array<{ id: string }>;
    sessionId = sessions[0].id;
  });

  afterEach(async () => {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    if (runner && !runner.isReleased) await runner.release();
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  async function expectDatabaseError(sql: string, params: unknown[], code: string) {
    await runner.query('SAVEPOINT expected_failure');
    try {
      await expect(runner.query(sql, params)).rejects.toMatchObject({ code });
    } finally {
      await runner.query('ROLLBACK TO SAVEPOINT expected_failure');
      await runner.query('RELEASE SAVEPOINT expected_failure');
    }
  }

  it('四个 Entity 的列、类型和可空性与实际表一致', async () => {
    const rows = await runner.query(`
      SELECT table_name, column_name, udt_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ANY($1::text[])
    `, [AI_ENTITIES.map((entity) => dataSource.getMetadata(entity).tableName)]) as Array<{
      table_name: string; column_name: string; udt_name: string; is_nullable: string;
    }>;
    for (const entity of AI_ENTITIES) {
      const metadata = dataSource.getMetadata(entity);
      const actual = rows.filter((row) => row.table_name === metadata.tableName);
      expect(actual).toHaveLength(metadata.columns.length);
      for (const column of metadata.columns) {
        expect(actual).toContainEqual({
          table_name: metadata.tableName,
          column_name: column.databaseName,
          udt_name: column.type,
          is_nullable: column.isNullable ? 'YES' : 'NO',
        });
      }
    }
  });

  it('通过 TypeORM 保存四类记录并读取数据库默认值', async () => {
    const session = await runner.manager.getRepository(AiChatSessionEntity).save({ id: sessionId });
    const memory = await runner.manager.getRepository(AiUserMemoryEntity).save({ userId, content: '偏好中文' });
    const task = await runner.manager.getRepository(AiTaskRecordEntity).save({ userId, name: '测试任务' });
    const audit = await runner.manager.getRepository(AiOperationAuditEntity).save({
      userId, action: 'task.create', resourceType: 'task', resourceId: task.id, result: 'success',
    });
    expect(session.status).toBe('active');
    expect(task.status).toBe('pending');
    for (const row of [session, memory, task, audit]) {
      expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(row.createdAt).toBeInstanceOf(Date);
    }
    expect(audit.resourceId).toBe(task.id);
    const withoutResource = await runner.manager.getRepository(AiOperationAuditEntity).save({
      userId, action: 'read', resourceType: 'session', result: 'success',
    });
    expect(withoutResource.resourceId).toBeNull();
  });

  it('DTO 使用的状态和结果值均被数据库约束接受', async () => {
    await runner.query('INSERT INTO ai_chat_session(id) VALUES ($1)', [sessionId]);
    for (const status of AI_SESSION_STATUSES) {
      await runner.query('UPDATE ai_chat_session SET status=$1 WHERE id=$2', [status, sessionId]);
    }
    for (const status of AI_TASK_STATUSES) {
      await runner.query('INSERT INTO ai_task_record(user_id,name,status) VALUES ($1,$2,$3)', [userId, '任务', status]);
    }
    for (const result of AI_AUDIT_RESULTS) {
      await runner.query('INSERT INTO ai_operation_audit(user_id,action,resource_type,result) VALUES ($1,$2,$3,$4)',
        [userId, 'read', 'task', result]);
    }
  });

  it('外键、状态及长度约束拒绝无效数据，禁止删除被引用的用户与会话', async () => {
    const missingId = randomUUID();
    await expectDatabaseError('INSERT INTO ai_chat_session(id) VALUES ($1)', [missingId], '23503');
    await runner.query('INSERT INTO ai_chat_session(id) VALUES ($1)', [sessionId]);
    await expectDatabaseError('INSERT INTO ai_chat_session(id) VALUES ($1)', [sessionId], '23505');
    await expectDatabaseError("UPDATE ai_chat_session SET status='invalid' WHERE id=$1", [sessionId], '23514');
    await expectDatabaseError('DELETE FROM ai_chat_sessions WHERE id=$1', [sessionId], '23503');

    await expectDatabaseError('INSERT INTO ai_user_memory(user_id,content) VALUES ($1,$2)', [missingId, 'test'], '23503');
    await expectDatabaseError('INSERT INTO ai_user_memory(user_id,content) VALUES ($1,$2)', [userId, '   '], '23514');
    await expectDatabaseError('INSERT INTO ai_user_memory(user_id,content) VALUES ($1,$2)', [userId, 'a'.repeat(10001)], '23514');
    await runner.query('INSERT INTO ai_user_memory(user_id,content) VALUES ($1,$2)', [userId, 'a'.repeat(10000)]);

    await expectDatabaseError('INSERT INTO ai_task_record(user_id,name) VALUES ($1,$2)', [missingId, 'test'], '23503');
    await expectDatabaseError('INSERT INTO ai_task_record(user_id,name) VALUES ($1,$2)', [userId, 'a'.repeat(201)], '23514');
    await expectDatabaseError("INSERT INTO ai_task_record(user_id,name,status) VALUES ($1,'task','invalid')", [userId], '23514');
    await expectDatabaseError("INSERT INTO ai_operation_audit(user_id,action,resource_type,result) VALUES ($1,'read','task','success')", [missingId], '23503');
    await expectDatabaseError("INSERT INTO ai_operation_audit(user_id,action,resource_type,result) VALUES ($1,'read','task','invalid')", [userId], '23514');
    await expectDatabaseError("INSERT INTO ai_operation_audit(user_id,action,resource_type,result) VALUES ($1,' ','task','success')", [userId], '23514');
    await expectDatabaseError('DELETE FROM users WHERE id=$1', [userId], '23503');
  });

  it('记忆、任务和审计分别阻止删除其所属用户', async () => {
    const inserts = [
      "INSERT INTO ai_user_memory(user_id,content) VALUES ($1,'memory')",
      "INSERT INTO ai_task_record(user_id,name) VALUES ($1,'task')",
      "INSERT INTO ai_operation_audit(user_id,action,resource_type,result) VALUES ($1,'read','task','success')",
    ];
    for (const insert of inserts) {
      const rows = await runner.query('INSERT INTO users(email,password_hash) VALUES ($1,$2) RETURNING id',
        [`ai-owned-${randomUUID()}@example.test`, '$argon2id$fixture']) as Array<{ id: string }>;
      await runner.query(insert, [rows[0].id]);
      await expectDatabaseError('DELETE FROM users WHERE id=$1', [rows[0].id], '23503');
    }
  });

  it('更新会话、记忆和任务时自动刷新 updated_at', async () => {
    await runner.query("INSERT INTO ai_chat_session(id,updated_at) VALUES ($1,'2000-01-01 UTC')", [sessionId]);
    await runner.query("INSERT INTO ai_user_memory(user_id,content,updated_at) VALUES ($1,'记忆','2000-01-01 UTC')", [userId]);
    await runner.query("INSERT INTO ai_task_record(user_id,name,updated_at) VALUES ($1,'任务','2000-01-01 UTC')", [userId]);
    const updates: Array<{ sql: string; params: unknown[] }> = [
      { sql: "UPDATE ai_chat_session SET status='closed' WHERE id=$1 RETURNING updated_at > '2000-01-01 UTC'::timestamptz AS refreshed", params: [sessionId] },
      { sql: "UPDATE ai_user_memory SET content='更新' WHERE user_id=$1 RETURNING updated_at > '2000-01-01 UTC'::timestamptz AS refreshed", params: [userId] },
      { sql: "UPDATE ai_task_record SET status='running' WHERE user_id=$1 RETURNING updated_at > '2000-01-01 UTC'::timestamptz AS refreshed", params: [userId] },
    ];
    for (const update of updates) {
      // TypeORM 的 UPDATE ... RETURNING 结果为 [rows, affected]。
      const [rows] = await runner.query(update.sql, update.params) as [Array<{ refreshed: boolean }>, number];
      expect(rows[0].refreshed).toBe(true);
    }
  });

  it('审计记录禁止 UPDATE 和 DELETE，并设置 TRUNCATE 防护', async () => {
    const rows = await runner.query("INSERT INTO ai_operation_audit(user_id,action,resource_type,result) VALUES ($1,'read','task','success') RETURNING id", [userId]) as Array<{ id: string }>;
    await expectDatabaseError("UPDATE ai_operation_audit SET action='changed' WHERE id=$1", [rows[0].id], '55000');
    await expectDatabaseError('DELETE FROM ai_operation_audit WHERE id=$1', [rows[0].id], '55000');
    const triggers = await runner.query(`SELECT pg_get_triggerdef(oid) AS definition FROM pg_trigger
      WHERE tgrelid='ai_operation_audit'::regclass AND NOT tgisinternal`) as Array<{ definition: string }>;
    expect(triggers.some((row) => /BEFORE.*TRUNCATE/i.test(row.definition))).toBe(true);
  });

  it('常用分页和按状态筛选的索引存在', async () => {
    const rows = await runner.query(`SELECT indexname FROM pg_indexes WHERE schemaname=current_schema()
      AND tablename = ANY($1::text[])`, [['ai_user_memory', 'ai_task_record', 'ai_operation_audit']]) as Row[];
    const names = rows.map((row) => row.indexname);
    expect(names).toEqual(expect.arrayContaining([
      'ai_user_memory_user_updated_idx', 'ai_task_record_user_created_idx',
      'ai_task_record_user_status_created_idx', 'ai_operation_audit_user_created_idx', 'ai_operation_audit_created_idx',
    ]));
  });
});
