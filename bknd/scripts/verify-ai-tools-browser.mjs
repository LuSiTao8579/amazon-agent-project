// Run with verify-ai-tools-browser.sh, which supplies a fresh isolated PostgreSQL and Redis.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { mock } from 'node:test';
import { NestFactory } from '@nestjs/core';
import { createClient } from '@redis/client';
import { chromium } from 'playwright-core';
import { ToolRegistryService } from '../dist/ai/tools/tool-registry.service.js';
import { commandProposals, verifyChatCommands } from './verify-chat-commands.mjs';
import { setupApp } from '../dist/setup-app.js';
import { PG_POOL } from '../dist/database/database.module.js';
import { CompaniesService } from '../dist/companies/companies.service.js';
import { UserManagementService } from '../dist/users/user-management.service.js';

// Check launcher-supplied connections before AppModule can load local .env files.
const mode = process.argv[2] ?? 'fixture';
assert.ok(['fixture', 'target'].includes(mode), 'mode must be fixture or target');
const database = new URL(process.env.DATABASE_URL);
const cache = new URL(process.env.REDIS_URL);
assert.ok(database.hostname === '127.0.0.1' && database.pathname === '/ai_tools_acceptance' &&
  cache.hostname === '127.0.0.1' && cache.pathname === '/0', 'Use the isolated browser acceptance launcher');
const { AppModule } = await import('../dist/app.module.js');
const userQuery = { search: 'Lin', roles: ['Analyst', 'Manager'], status: 'inactive',
  sortBy: 'name', sortOrder: 'asc', page: 2, pageSize: 2 };
const companyQuery = { country: 'UK', city: 'London', levels: [2, 3], sortBy: 'companyName', sortOrder: 'asc' };
const dashboardQuery = { country: 'UK', levels: [2, 3], foundedYearFrom: 2018, foundedYearTo: 2020 };
const users = '查姓名含 Lin、岗位 Analyst 或 Manager 的停用用户，姓名升序，每页 2 人，取第 2 页';
const companies = '查英国伦敦、等级 2 和 3 的公司，按名称升序';
const dashboard = '看 2018 至 2020 年成立的英国等级 2 或 3 公司的 Dashboard';
const badPage = '查英国公司，每页 101 家';
const serviceFault = '查公司服务异常示例';
const modelFault = '测试模型暂不可用';
const proposals = new Map([
  ...commandProposals,
  [users, ['query_users', userQuery]], [companies, ['query_companies', companyQuery]],
  [dashboard, ['dashboard_metrics', dashboardQuery]], [badPage, ['query_companies', { pageSize: 101 }]],
  [serviceFault, ['query_companies', { search: 'private@example.test' }]],
]);

// Only the model's proposed name and arguments are fixed. Rows come from the running business services.
let modelCalls = 0;
const model = createServer(async (req, res) => {
  try {
    let raw = '';
    for await (const part of req) raw += part;
    const { messages, tools } = JSON.parse(raw);
    if (messages.at(-1).content === modelFault) {
      res.writeHead(503, { 'Content-Type': 'text/plain' }).end('fixture_model_error');
      return;
    }
    const [name, args] = proposals.get(messages.at(-1).content);
    assert.ok(tools.some(tool => tool.function.name === name), 'expected tool in candidate set');
    modelCalls++;
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
      choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [
        { type: 'function', function: { name, arguments: JSON.stringify(args) } },
      ] } }],
    }));
  } catch (error) {
    console.error('模型测试提案失败', error.message);
    res.writeHead(500).end();
  }
});

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return 'http://127.0.0.1:' + server.address().port;
}
async function http(base, path, { token, body, expected = body ? 201 : 200 } = {}) {
  const res = await fetch(base + path, { method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
    body: body && JSON.stringify(body) });
  assert.equal(res.status, expected, path);
  return res.json();
}

async function send(page, text) {
  await page.getByRole('textbox', { name: '输入消息' }).fill(text);
  const [turn, history] = await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/turns') && r.request().method() === 'POST', { timeout: mode === 'target' ? 75000 : 10000 }),
    page.waitForResponse(r => r.url().includes('/api/ai-chat/history'), { timeout: mode === 'target' ? 75000 : 10000 }),
    page.getByRole('button', { name: '发送消息' }).click(),
  ]);
  if (turn.status() !== 201) {
    const last = (await history.json()).messages?.at(-1);
    throw new Error('聊天回合 HTTP ' + turn.status() + '，' + (last?.turnStatus ?? '未完成'));
  }
  assert.deepEqual(await turn.json(), { status: 'completed' });
  assert.equal(history.status(), 200);
  const { messages } = await history.json();
  assert.equal(messages.at(-2).content.text, text);
  return { last: messages.at(-1), messages, request: turn.request() };
}
const openChat = page => page.getByRole('button', { name: '打开 AI 助手' }).click();
async function errorTurn(page, question, expected) {
  const { last } = await send(page, question);
  assert.equal(last.type, 'tool-error');
  assert.equal(last.content.message, expected);
  await page.getByRole('alert').getByText(expected, { exact: true }).last().waitFor();
}
function pick(row, keys) { return Object.fromEntries(keys.map(key => [key, row[key]])); }

let app, next, browser, redis;
async function verify() {
  if (mode === 'fixture') {
    const modelURL = await listen(model);
    Object.assign(process.env, { AI_MODEL_PROVIDER: 'qwen', AI_QWEN_MODEL: 'fixture',
      AI_QWEN_BASE_URL: modelURL, AI_QWEN_API_KEY: 'fixture' });
  } else {
    const provider = (process.env.AI_MODEL_PROVIDER || 'qwen').trim().toUpperCase();
    console.log('目标模型', provider, process.env['AI_' + provider + '_MODEL']);
  }
  app = await NestFactory.create(AppModule, { logger: false });
  setupApp(app);
  await app.listen(0, '127.0.0.1');
  const backend = await app.getUrl();
  const pool = app.get(PG_POOL);
  const companyList = mock.method(app.get(CompaniesService), 'list');
  const userList = mock.method(app.get(UserManagementService), 'list');
  redis = createClient({ url: process.env.REDIS_URL });
  await redis.connect();
  const portProbe = createServer();
  const frontend = await listen(portProbe);
  await new Promise(resolve => portProbe.close(resolve));
  next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1',
    '-p', new URL(frontend).port], { cwd: '../ftnd', stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('AI_'))), BACKEND_URL: backend, APP_ORIGIN: frontend } });
  for (let i = 0; i < 100; i++) {
    if (await fetch(frontend + '/login').then(r => r.ok).catch(() => false)) break;
    assert.ok(next.exitCode === null && i !== 99, 'frontend startup failed');
    await delay(200);
  }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
    ...(process.env.HEADED === '1' && { headless: false, slowMo: 300 }) });
  async function account(email, admin) {
    const credentials = { email, password: randomUUID() };
    const { user } = await http(backend, '/auth/signup', { body: credentials });
    if (admin) await pool.query('UPDATE users SET is_admin=true WHERE id=$1', [user.id]);
    const ctx = await browser.newContext();
    const login = await ctx.request.post(frontend + '/api/auth/login', {
      data: credentials, headers: { Origin: frontend } });
    assert.equal(login.status(), 200);
    const token = (await ctx.cookies(frontend)).find(c => c.name === 'supply_chain_session').value;
    const get = path => http(backend, path, { token });
    const session = await http(backend, '/ai-agent/sessions', { token,
      body: { title: admin ? '管理员演示' : '普通用户演示' } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(10000);
    if (mode === 'target') page.setDefaultNavigationTimeout(75000);
    await page.goto(frontend + '/order');
    await openChat(page);
    await page.getByText('当前会话：' + session.title, { exact: true }).waitFor();
    return { id: user.id, token, page, session, ctx, get };
  }
  const commandAdmin = await account('command-admin@example.test', true);
  const commandMember = await account('command-member@example.test', false);
  for (const [i, [name, role, status]] of [
    ['Lin A', 'Manager', 'inactive'], ['Lin B', 'Analyst', 'inactive'], ['Lin C', 'Manager', 'inactive'],
    ['Lin D', 'Analyst', 'inactive'], ['Lin E', 'Member', 'inactive'], ['Lin F', 'Analyst', 'active'],
    ['Other', 'Manager', 'inactive'], ['Ada', 'Analyst', 'active'],
  ].entries()) await http(backend, '/users', { token: commandAdmin.token, body: {
    name, role, status, email: 'sample' + i + '@example.test', password: randomUUID() } });
  await pool.query(`INSERT INTO companies(company_code,company_name,level,country,city,founded_year,annual_revenue,employees) VALUES
    ('A','Alpha',2,'UK','London',2018,200,2), ('B','Beta',3,'UK','London',2020,500,1),
    ('C','Cedar',3,'UK','London',2020,42,0), ('D','Delta',2,'UK','Leeds',2020,50,2),
    ('E','Elsewhere',3,'US','London',2018,80,8), ('F','Fourth',4,'UK','London',2018,990,10),
    ('G','Grove',2,'UK','Leeds',2021,200,10)`);

  await verifyChatCommands({ admin: commandAdmin, member: commandMember, send, userList, mode,
    registry: mock.method(app.get(ToolRegistryService), 'execute') });
  if (mode === 'target') return;
  await commandAdmin.ctx.close();
  await commandMember.ctx.close();
  const admin = await account('admin@example.test', true);
  const member = await account('member@example.test', false);
  const { last: userTable, request: submitted, messages: original } = await send(admin.page, users);
  const baseline = await admin.get('/users?' + new URLSearchParams(userQuery));
  assert.deepEqual([userTable.type, userTable.content.tableType, baseline.total], ['table', 'users', 4]);
  assert.deepEqual(pick(userTable.content, ['total', 'page', 'pageSize']), pick(baseline, ['total', 'page', 'pageSize']));
  assert.deepEqual(userTable.content.users, baseline.items.map(row => pick(row, ['name', 'email', 'role', 'status'])));
  const userView = admin.page.getByRole('table', { name: '用户查询结果' });
  await userView.getByText('Lin C', { exact: true }).waitFor();
  assert.deepEqual(await userView.locator('tbody td').allTextContents(),
    baseline.items.flatMap(row => [row.name, row.email, row.role, '停用']));
  const userCalls = userList.mock.callCount();
  const beforeModel = modelCalls;
  const audits = async actor => (await actor.get('/ai/audits?pageSize=100')).items.filter(a => a.resourceType === 'tool');
  const beforeAudit = await audits(admin);
  const replay = await admin.ctx.request.post(submitted.url(), {
    headers: { Origin: frontend }, data: submitted.postDataJSON() });
  assert.equal(replay.status(), 201);
  assert.equal(modelCalls, beforeModel);
  assert.equal(userList.mock.callCount(), userCalls);
  assert.deepEqual(await audits(admin), beforeAudit);
  const historyURL = frontend + '/api/ai-chat/history?sessionId=' + admin.session.id;
  assert.deepEqual((await (await admin.ctx.request.get(historyURL)).json()).messages, original);
  console.log('PASS 管理员组合筛选、第二页顺序、同一 requestId 重放、业务查询与审计次数');

  await errorTurn(member.page, users, '你没有权限执行此查询。');
  assert.equal(userList.mock.callCount(), userCalls);
  assert.equal(await member.page.getByRole('table', { name: '用户查询结果' }).count(), 0);
  assert.equal((await member.ctx.request.get(historyURL)).status(), 404);
  assert.equal((await audits(member))[0].resultSummary.code, 'FORBIDDEN');
  console.log('PASS 普通用户拒绝、业务用户列表调用零增量、跨账号会话隔离');

  const companyResult = await send(member.page, companies);
  const companyContent = companyResult.last.content;
  const companyBase = await member.get('/companies?' + new URLSearchParams(companyQuery));
  assert.deepEqual(companyContent.companies, companyBase.items.map(row =>
    pick(row, ['companyCode','companyName','level','country','revenuePerEmployee','city','foundedYear','annualRevenue','employees'])));
  assert.deepEqual([companyContent.total, companyContent.page, companyContent.pageSize], [3, 1, 10]);
  const grid = member.page.getByRole('table', { name: '公司查询结果' }).first();
  for (const [name, bg, label] of [['Alpha', 'rgb(227, 242, 253)', '100'], ['Beta', 'rgb(232, 245, 233)', '500'], ['Cedar', null, '不可计算']]) {
    const header = grid.getByRole('rowheader', { name, exact: true });
    const chip = header.locator('..').locator('.MuiChip-root');
    await chip.getByText(label, { exact: true }).waitFor();
    if (bg) assert.equal(await chip.evaluate(el => getComputedStyle(el).backgroundColor), bg);
  }
  await grid.getByRole('button', { name: '展开 Cedar' }).click();
  for (const detail of ['城市：London', '成立年份：2020', '年营收：42', '员工数量：0']) await grid.getByText(detail).waitFor();

  const callsBeforeDisable = companyList.mock.callCount();
  await redis.hSet('ai:tools:enabled', 'query_companies', '0');
  await errorTurn(member.page, companies, '该工具暂不可用，请稍后再试。');
  assert.equal(companyList.mock.callCount(), callsBeforeDisable);
  const report = (await send(member.page, dashboard)).last;
  assert.equal(report.type, 'report');
  assert.deepEqual(report.content.report, await member.get('/dashboard?' + new URLSearchParams(dashboardQuery)));
  assert.deepEqual(report.content.report.summary, { companyCount: 4, countryCount: 1, totalRevenue: 792, employeeCount: 5 });
  assert.deepEqual(report.content.report.yearlyGrowth.map(row => row.cumulativeCompanies), [1, 1, 4]);
  assert.deepEqual(report.content.report.levelDistribution.map(row => row.percentage), [50, 50]);
  for (const label of ['公司等级占比环形图', '按成立年份累计公司数量折线图']) await member.page.getByRole('img', { name: label }).waitFor();
  await redis.hSet('ai:tools:enabled', 'query_companies', '1');
  assert.deepEqual((await send(member.page, companies)).last.content, companyContent);
  assert.equal(companyList.mock.callCount(), callsBeforeDisable + 1);
  console.log('PASS 公司组合查询、详情、色阶与零员工；开关即时生效、其他工具可用；Dashboard 指标和图表');

  await errorTurn(member.page, badPage, '每页条数须为 1 至 100 的整数。');
  assert.equal(companyList.mock.callCount(), callsBeforeDisable + 1);
  companyList.mock.mockImplementationOnce(async () => { throw new Error('fixture_database_error'); });
  await errorTurn(member.page, serviceFault, '查询未完成，请稍后重试。');
  const memberAudits = await audits(member);
  assert.deepEqual(memberAudits.map(row => row.resultSummary.code),
    ['EXECUTION_FAILED','INVALID_ARGUMENTS','OK','OK','TOOL_UNAVAILABLE','OK','FORBIDDEN']);
  assert.ok(memberAudits.every(a => a.userId === member.id && a.toolName && a.ip && a.action && a.createdAt));
  assert.deepEqual(memberAudits[0].inputParams, { search: '[REDACTED]' });
  assert.doesNotMatch(JSON.stringify(memberAudits), /fixture_database_error|private@example.test/);
  assert.doesNotMatch(await member.page.getByRole('dialog').innerText(), /fixture_database_error|private@example.test/);
  const all = (await admin.get('/ai/admin/audits?pageSize=100')).items;
  assert.ok(all.some(a => a.userId === admin.id) && all.some(a => a.userId === member.id));
  console.log('PASS 参数错误、业务异常的统一提示、用户级和全量审计、错误信息脱敏');

  await member.page.getByRole('textbox', { name: '输入消息' }).fill(modelFault);
  const [failed] = await Promise.all([
    member.page.waitForResponse(r => r.url().endsWith('/turns')),
    member.page.getByRole('button', { name: '发送消息' }).click(),
  ]);
  assert.equal(failed.status(), 502);
  await member.page.getByRole('alert').getByText('服务暂时不可用，请稍后重试').waitFor();
  assert.doesNotMatch(await member.page.getByRole('dialog').innerText(), /fixture_model_error/);
  assert.deepEqual(await audits(member), memberAudits);
  console.log('PASS 上游模型错误被安全展示，未产生额外工具调用');

  const savedURL = frontend + '/api/ai-chat/history?sessionId=' + member.session.id;
  const history = await (await member.ctx.request.get(savedURL)).json();
  const page = member.page;
  await page.reload();
  await openChat(page);
  await grid.getByRole('button', { name: '展开 Cedar' }).click();
  await grid.getByText('员工数量：0').waitFor();
  const sessions = page.getByRole('button', { name: '会话', exact: true });
  await sessions.click();
  await page.getByRole('button', { name: '新建会话' }).click();
  await page.getByRole('textbox', { name: '会话名称' }).fill('第二会话');
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await page.getByText('当前会话：第二会话', { exact: true }).waitFor();
  assert.equal(await grid.count(), 0);
  await sessions.click();
  await page.getByText(member.session.title, { exact: true }).click();
  await grid.getByText('Cedar', { exact: true }).waitFor();
  await page.getByRole('img', { name: '公司等级占比环形图' }).waitFor();
  assert.deepEqual((await (await member.ctx.request.get(savedURL)).json()).messages, history.messages);
  console.log('PASS 刷新、跨会话切换与历史恢复，两账号聊天全链路验收通过');
}

try {
  await verify();
} finally {
  await browser?.close();
  next?.kill();
  await app?.close();
  if (redis?.isOpen) await redis.quit();
  model.closeAllConnections();
  model.close();
}
