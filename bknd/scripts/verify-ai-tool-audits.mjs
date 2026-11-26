// 由 verify-ai-foundation.sh 在临时升级库中串行运行。每个 HTTP 请求单独核对全库增量。
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';
import { createClient } from '@redis/client';
import { PG_POOL } from '../dist/database/database.module.js';
import { ModelService } from '../dist/ai-agent/providers/model.service.js';
import { ToolRegistryService } from '../dist/ai/tools/tool-registry.service.js';
import { CompaniesService } from '../dist/companies/companies.service.js';

const masked = '[REDACTED]';
const markers = {
  search: 'AuditSearchSample', company: 'PrivateCompanyRow', city: 'PrivateAuditCity',
  password: 'PrivateAuditPassword', token: 'PrivateAuditToken', nested: 'NestedAuditSecret',
  key: 'ConfidentialAuditKey', note: 'SensitiveAuditFreeText', error: 'InternalAuditFailure',
};

function checkRedaction(output) {
  const encoded = JSON.stringify(output);
  for (const [kind, sample] of Object.entries(markers)) {
    assert.ok(!encoded.includes(sample), '审计中检出合成样本类别 ' + kind);
  }
}

async function account(http) {
  const credentials = { email: randomUUID() + '@example.test', password: randomUUID() };
  await http.post('/auth/signup').send(credentials).expect(201);
  const { body } = await http.post('/auth/login').send(credentials).expect(200);
  return { id: body.user.id, bearer: { Authorization: 'Bearer ' + body.accessToken } };
}

export async function verifyToolAudits(app, http, otherBearer) {
  const db = app.get(PG_POOL);
  const member = await account(http);
  const admin = await account(http);
  await db.query('UPDATE users SET is_admin=true WHERE id=$1', [admin.id]);
  const { body: session } = await http.post('/ai/sessions').set(member.bearer).send({ title: '审计对账' }).expect(201);
  await db.query(`INSERT INTO companies(company_code,company_name,level,country,city,founded_year,annual_revenue,employees)
    VALUES ('AUDIT_A',$1,2,'UK',$3,2020,200,2), ('AUDIT_B',$2,3,'UK',$3,2020,600,3)`,
    [markers.search + markers.company + 'A', markers.search + markers.company + 'B', markers.city]);

  const list = async (bearer, path, filters = {}) => {
    const { body } = await http.get(path).set(bearer).query({ pageSize: 100, ...filters }).expect(200);
    assert.equal(body.hasMore, false, '隔离库中的所有记录须在当前页内');
    checkRedaction(body);
    return body.items;
  };
  const mine = '/ai/audits';
  const all = '/ai/admin/audits';
  const redis = createClient({ url: process.env.REDIS_URL });
  await redis.connect();
  const registry = mock.method(app.get(ToolRegistryService), 'execute');
  const companies = mock.method(app.get(CompaniesService), 'list');
  const company = 'query_companies';
  let proposal;
  const model = mock.method(app.get(ModelService), 'chat', async () => proposal);
  const recorded = [];
  const ids = rows => rows.map(row => row.id).sort();
  const dbTime = async () => (await db.query('SELECT clock_timestamp() AS now')).rows[0].now.getTime();
  const dbRows = async () => (await db.query('SELECT * FROM ai_operation_audit')).rows;

  // expected 为本次请求预期的审计（重放和入口 401 为空）。调用前先记下两个观察面的 ID。
  async function run(label, { tool = company, args = {}, requestId = randomUUID(),
    bearer = member.bearer, httpStatus = 201, loads = 0, expected }) {
    const before = new Set(ids(await dbRows()));
    const apiBefore = ids(await list(admin.bearer, all));
    assert.deepEqual(apiBefore, [...before].sort());
    const calls = registry.mock.callCount();
    const queries = companies.mock.callCount();
    proposal = { tool, args };
    const start = await dbTime();
    const { body } = await http.post('/ai-agent/sessions/' + session.id + '/turns')
      .set(bearer).set('X-Forwarded-For', '192.0.2.44')
      .send({ requestId, text: tool === company ? '查询公司' : '查询用户' }).expect(httpStatus);
    const end = await dbTime();
    const rows = await dbRows();
    const api = await list(admin.bearer, all);
    checkRedaction(rows);
    assert.deepEqual(ids(api), ids(rows), label);
    const added = rows.filter(row => !before.has(row.id));
    const apiAdded = api.filter(row => !before.has(row.id));
    const count = expected ? 1 : 0;
    assert.equal(registry.mock.callCount() - calls, count, label + ' 注册中心');
    assert.equal(companies.mock.callCount() - queries, loads, label + ' 公司 Service');
    assert.equal(added.length, count, label + ' 数据库');
    assert.equal(api.length - apiBefore.length, count, label + ' API');
    if (expected) {
      const [row] = added;
      const { code, params } = expected;
      const success = code === 'OK';
      const summary = success ? { code, resultType: 'table', returnedCount: 1, total: 2 } : { code, resultType: 'text' };
      const content = body.assistantMessage.content;
      assert.equal(content.code, code);
      if (success) {
        assert.equal(content.data.items.length, summary.returnedCount);
        assert.equal(content.data.total, summary.total);
        assert.equal(content.data.items[0].companyName, markers.search + markers.company + 'A');
      }
      assert.match(row.ip, /^(::1|(::ffff:)?127\.0\.0\.1)$/);
      assert.ok(row.created_at.getTime() >= start && row.created_at.getTime() <= end, label + ' 审计时间');
      const common = { id: row.id, action: tool === company ? 'companies.read' : 'users.read',
        result: success ? 'success' : 'failure', ip: row.ip };
      assert.deepEqual(row, { ...common, resource_type: 'tool', resource_id: null, user_id: member.id,
        tool_name: tool, input_params: params, result_summary: summary, created_at: row.created_at });
      const apiRow = { ...common, resourceType: 'tool', resourceId: null, userId: member.id, toolName: tool,
        inputParams: params, resultSummary: summary, createdAt: row.created_at.toISOString() };
      assert.deepEqual(apiAdded, [apiRow]);
      const detail = await http.get(mine + '/' + row.id).set(member.bearer).expect(200);
      checkRedaction(detail.body);
      assert.deepEqual(detail.body, apiRow);
      recorded.push(apiRow);
    }
    console.log(label + '：注册中心 / PostgreSQL / 审计 API 增量 ' + [count, added.length, apiAdded.length].join(' / '));
    return body;
  }

  try {
    const args = { search: markers.search, pageSize: 1 };
    const params = { search: masked, pageSize: 1 };
    const ok = { code: 'OK', params };
    const cold = await run('正常查询', { args, loads: 1, expected: ok });
    const requestId = randomUUID();
    const hot = await run('新回合命中缓存', { args, requestId, expected: ok });
    assert.notEqual(hot.turnId, cold.turnId);
    assert.deepEqual(hot.assistantMessage.content, cold.assistantMessage.content);
    assert.deepEqual(await run('已完成回合重放', { args, requestId }), hot);
    await run('权限拒绝', { tool: 'query_users', expected: { code: 'FORBIDDEN', params: {} } });
    await redis.hSet('ai:tools:enabled', company, '0');
    try {
      await run('禁用已缓存的工具', { args, expected: { code: 'TOOL_UNAVAILABLE', params } });
    } finally {
      await redis.hDel('ai:tools:enabled', company);
    }
    await run('非法参数', {
      args: { filters: [{ password: markers.password, token: markers.token,
        [markers.key]: { page: markers.nested }, search: markers.note }] },
      expected: { code: 'INVALID_ARGUMENTS', params: { filters: [{ password: masked, token: masked,
        field_2: masked, search: masked }] } },
    });
    companies.mock.mockImplementationOnce(async () => { throw new Error(markers.error); });
    await run('业务异常', { args: { page: 2 }, loads: 1, expected: { code: 'EXECUTION_FAILED', params: { page: 2 } } });
    await run('JWT 缺失', { bearer: {}, httpStatus: 401 });
    await run('JWT 无效', { bearer: { Authorization: 'Bearer ' + markers.token }, httpStatus: 401 });

    const ownIds = ids(recorded);
    assert.deepEqual(ids(await list(member.bearer, mine)), ownIds);
    const others = await list(otherBearer, mine);
    assert.ok(others.length > 0);
    assert.ok(others.every(row => row.userId !== member.id));
    await http.get(mine + '/' + recorded[0].id).set(otherBearer).expect(404);
    await http.get(mine + '/' + others[0].id).set(member.bearer).expect(404);
    await http.get(all).set(member.bearer).expect(403);
    const detail = await http.get(all + '/' + recorded[0].id).set(admin.bearer).expect(200);
    checkRedaction(detail.body);
    assert.deepEqual(detail.body, recorded[0]);
    assert.deepEqual(ids(await list(admin.bearer, all, { userId: member.id })), ownIds);
    // API 时间精度为毫秒，包含目标行所在整毫秒。前后均有实际记录可供排除。
    const target = recorded[2];
    const window = { from: target.createdAt, to: new Date(Date.parse(target.createdAt) + 1).toISOString() };
    assert.deepEqual(ids(await list(admin.bearer, all, { userId: member.id, ...window })), [target.id]);
    console.log('工具审计通过：6 次新调度，6 条已提交审计；重放和两次入口 401 合计 0 条。数据库和审计 API 合成敏感样本明文检出 0。');

    // 固定模型误提写工具，取得本次真实 HTTP 登录签发的管理员上下文。
    const createName = 'userCreateTool';
    const createArgs = { name: 'Audit fixture', role: 'Member', status: 'active',
      email: randomUUID() + '@example.test', password: markers.password };
    proposal = { tool: createName, args: createArgs };
    const adminSession = await http.post('/ai/sessions').set(admin.bearer).send({ title: '创建预览审计' }).expect(201);
    const refused = await http.post('/ai-agent/sessions/' + adminSession.body.id + '/turns').set(admin.bearer)
      .send({ requestId: randomUUID(), text: '创建一个新用户' }).expect(201);
    assert.equal(refused.body.assistantMessage.content.code, 'TOOL_UNAVAILABLE');
    const [proposedName, context] = registry.mock.calls.at(-1).arguments;
    assert.equal(proposedName, createName);
    const tools = app.get(ToolRegistryService);
    const preview = await tools.prepareWrite(createName, 'preview', context, createArgs);
    assert.deepEqual(preview, { target: 'user', operation: 'create', changedFields: ['role', 'status', 'name'] });
    await assert.rejects(tools.prepareWrite(createName, 'preview', context, { ...createArgs, role: 'invalid' }),
      error => error.getStatus() === 400);
    const saved = (await db.query('SELECT * FROM ai_operation_audit WHERE user_id=$1 AND tool_name=$2',
      [admin.id, createName])).rows;
    assert.deepEqual(saved.map(row => [row.action, row.result_summary.code]).sort(), [
      ['tool.execute', 'TOOL_UNAVAILABLE'], ['user.create.preview', 'INVALID_ARGUMENTS'], ['user.create.preview', 'OK'],
    ]);
    const visible = (await list(admin.bearer, mine)).filter(row => row.toolName === createName);
    assert.deepEqual(ids(saved), ids(visible));
    for (const output of [preview, saved, visible]) {
      checkRedaction(output);
      assert.ok(!JSON.stringify(output).includes('"password"'), '预览与创建审计须排除密码字段');
    }
    assert.equal((await db.query('SELECT 1 FROM users WHERE email=$1', [createArgs.email])).rowCount, 0);
    console.log('创建工具审计通过：聊天拦截、合法预览、非法参数各产生 1 条记录；预览、数据库和审计 API 均无密码字段或样本值。');
  } finally {
    model.mock.restore();
    registry.mock.restore();
    companies.mock.restore();
    await redis.quit();
  }
}
