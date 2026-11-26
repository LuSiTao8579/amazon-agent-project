// 在现有隔离迁移验收应用中运行。真实 HTTP 写入，独立数据库连接回读已提交的行。
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';
import { PG_POOL } from '../dist/database/database.module.js';
import { ModelService } from '../dist/ai-agent/providers/model.service.js';

export async function verifyAiStorage(app, http, otherBearer) {
  const credentials = { email: 'storage-' + randomUUID() + '@example.test', password: randomUUID() };
  await http.post('/auth/signup').send(credentials).expect(201);
  const { body: login } = await http.post('/auth/login').send(credentials).expect(200);
  const owner = login.user.id;
  const bearer = { Authorization: 'Bearer ' + login.accessToken };
  const create = async (path, input) => (await http.post(path).set(bearer).send(input).expect(201)).body;
  const db = app.get(PG_POOL);

  const session = await create('/ai/sessions', { title: '存储验收' });
  const memory = await create('/ai/memories', { content: '按公司名称排序' });
  const task = await create('/ai/tasks', { name: '检查公司清单' });
  assert.equal(session.status, 'active');
  assert.equal(task.status, 'pending');
  await http.patch('/ai/tasks/' + task.id).set(bearer).send({ status: 'running' }).expect(200);
  const turns = '/ai-agent/sessions/' + session.id + '/turns';
  for (const [text, tool, code] of [['查公司', 'query_companies', 'OK'], ['查用户', 'query_users', 'FORBIDDEN']]) {
    const input = { requestId: randomUUID(), text };
    // 仅固定模型提案，身份、工具权限、Service、审计和回合持久化均由应用处理。
    const model = mock.method(app.get(ModelService), 'chat', async () => ({ tool, args: {} }));
    try {
      const first = await create(turns, input);
      assert.equal(first.assistantMessage.content.code, code);
      assert.deepEqual(await create(turns, input), first);
      assert.equal(model.mock.callCount(), 1);
    } finally {
      model.mock.restore();
    }
  }
  await http.patch('/ai/sessions/' + session.id).set(bearer).send({ status: 'closed' }).expect(200);
  for (const [path, id] of [['sessions', session.id], ['memories', memory.id], ['tasks', task.id]]) {
    await http.get('/ai/' + path + '/' + id).set(otherBearer).expect(404);
  }

  const sessions = await db.query(`SELECT a.id, s.user_id, a.status
    FROM ai_chat_session a JOIN ai_chat_sessions s ON s.id=a.id WHERE s.user_id=$1`, [owner]);
  assert.deepEqual(sessions.rows, [{ id: session.id, user_id: owner, status: 'closed' }]);
  const memories = await db.query('SELECT id, content FROM ai_user_memory WHERE user_id=$1', [owner]);
  assert.deepEqual(memories.rows, [{ id: memory.id, content: '按公司名称排序' }]);
  const tasks = await db.query(`SELECT id, name, status, updated_at > created_at AS refreshed
    FROM ai_task_record WHERE user_id=$1`, [owner]);
  assert.deepEqual(tasks.rows, [{ id: task.id, name: '检查公司清单', status: 'running', refreshed: true }]);
  const audits = await db.query(`SELECT id, resource_type, tool_name, action, result, result_summary->>'code' AS code
    FROM ai_operation_audit WHERE user_id=$1 ORDER BY tool_name`, [owner]);
  assert.deepEqual(audits.rows.map(({ id, ...fields }) => fields), [
    { resource_type: 'tool', tool_name: 'query_companies', action: 'companies.read', result: 'success', code: 'OK' },
    { resource_type: 'tool', tool_name: 'query_users', action: 'users.read', result: 'failure', code: 'FORBIDDEN' },
  ]);
  for (const row of audits.rows) {
    await http.get('/ai/audits/' + row.id).set(otherBearer).expect(404);
  }

  // 全库核查覆盖升级前样本。旧审计允许无工具名，有合法的匿名拒绝时允许无 user_id。
  const quality = await db.query(`SELECT
    (SELECT count(*)::int FROM ai_chat_session a LEFT JOIN ai_chat_sessions s ON s.id=a.id
      LEFT JOIN users u ON u.id=s.user_id WHERE u.id IS NULL OR a.status NOT IN ('active','closed')) AS sessions,
    (SELECT count(*)::int FROM ai_user_memory m LEFT JOIN users u ON u.id=m.user_id
      WHERE u.id IS NULL OR m.content !~ '[^[:space:]]') AS memories,
    (SELECT count(*)::int FROM ai_task_record t LEFT JOIN users u ON u.id=t.user_id
      WHERE u.id IS NULL OR t.name !~ '[^[:space:]]' OR t.updated_at<t.created_at
      OR t.status NOT IN ('pending','running','completed','failed','cancelled')) AS tasks,
    (SELECT count(*)::int FROM ai_operation_audit a LEFT JOIN users u ON u.id=a.user_id
      WHERE (a.user_id IS NOT NULL AND u.id IS NULL)
      OR (a.user_id IS NULL AND (a.resource_type='tool' AND a.tool_name IS NOT NULL AND a.result='failure'
        AND a.ip IS NULL AND a.result_summary->>'code'='UNAUTHENTICATED') IS NOT TRUE)
      OR a.action !~ '[^[:space:]]' OR a.resource_type !~ '[^[:space:]]'
      OR a.result NOT IN ('success','failure')) AS audits`);
  assert.deepEqual(quality.rows, [{ sessions: 0, memories: 0, tasks: 0, audits: 0 }]);
  console.log('四表回读通过：本账号会话 1、记忆 1、任务 1、工具审计 2；两次重放无重复审计。升级测试库四类异常行数均为 0。');
}
