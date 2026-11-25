import assert from 'node:assert/strict';

const users = '查询状态为启用的 Analyst 用户，按姓名升序，显示第一页。';
const companies = '查询英国伦敦等级为 2 或 3 的公司。';
const dashboard = '查看 2018 到 2020 年成立的英国公司的总营收和等级分布。';
const denied = '查询用户列表。';
const empty = '查询城市为 Atlantis 的公司。';

export const commandProposals = new Map([
  [users, ['query_users', { status: 'active', roles: ['Analyst'], sortBy: 'name', sortOrder: 'asc', page: 1 }]],
  [companies, ['query_companies', { country: 'UK', city: 'London', levels: [2, 3] }]],
  [dashboard, ['dashboard_metrics', { country: 'UK', foundedYearFrom: 2018, foundedYearTo: 2020, charts: ['levelDistribution'] }]],
  [denied, ['query_users', {}]],
  [empty, ['query_companies', { city: 'Atlantis' }]],
]);

export async function verifyChatCommands({ admin, member, send, registry, userList, mode }) {
  const failures = [];
  async function check(actor, question, verify) {
    const start = registry.mock.callCount();
    let calls;
    try {
      const turn = await send(actor.page, question);
      // 观察生产调度器收到的参数，不读取身份上下文，不替换工具实现。
      calls = registry.mock.calls.slice(start).map(({ arguments: [tool, , args] }) => ({ tool, args }));
      assert.equal(calls.length, 1);
      assert.equal(calls[0].tool, commandProposals.get(question)[0]);
      const description = await verify(turn, calls[0].args);
      console.log(JSON.stringify({ mode, question, ...calls[0], page: description, status: 'PASS' }));
    } catch (error) {
      calls ??= registry.mock.calls.slice(start).map(({ arguments: [tool, , args] }) => ({ tool, args }));
      console.error(JSON.stringify({ mode, question, calls, status: 'FAIL', reason: error.message }));
      failures.push(question);
    }
  }

  await check(admin, users, async ({ last }, args) => {
    assert.deepEqual(args.roles, ['Analyst']);
    assert.equal(args.status, 'active');
    assert.equal(args.sortBy, 'name');
    assert.equal(args.sortOrder, 'asc');
    const baseline = await admin.get('/users?roles=Analyst&status=active&sortBy=name&sortOrder=asc&page=1&pageSize=' + last.content.pageSize);
    const rows = baseline.items.map(({ name, email, role, status }) => ({ name, email, role, status }));
    assert.equal(baseline.total, 2);
    assert.equal(last.content.page, 1);
    assert.equal(last.content.total, baseline.total);
    assert.deepEqual(last.content.users, rows);
    const table = admin.page.getByRole('table', { name: '用户查询结果' });
    await table.getByText(rows[0].name, { exact: true }).waitFor();
    assert.deepEqual(await table.locator('tbody td').allTextContents(), rows.flatMap(r => [r.name, r.email, r.role, '启用']));
    return rows.map(r => r.name).join('、') + '，第 1 页';
  });

  await check(member, companies, async ({ last }, args) => {
    assert.equal(args.country?.toUpperCase(), 'UK');
    assert.equal(args.city?.toLowerCase(), 'london');
    assert.deepEqual([...args.levels].sort(), [2, 3]);
    const baseline = await member.get('/companies?country=UK&city=London&levels=2,3');
    assert.equal(last.content.total, 3);
    const expected = baseline.items.map(({ createdAt, updatedAt, ...row }) => row);
    const byCode = (a, b) => a.companyCode.localeCompare(b.companyCode);
    assert.deepEqual(last.content.companies.toSorted(byCode), expected.toSorted(byCode));
    const table = member.page.getByRole('table', { name: '公司查询结果' });
    for (const row of expected) await table.getByRole('rowheader', { name: row.companyName, exact: true }).waitFor();
    await table.getByRole('button', { name: '展开 Cedar' }).click();
    await table.getByText('年营收：42', { exact: true }).waitFor();
    await table.getByText('员工数量：0', { exact: true }).waitFor();
    return 'Alpha、Beta、Cedar，Cedar 展开显示年营收 42、员工 0';
  });

  await check(member, dashboard, async ({ last }, args) => {
    assert.equal(args.country?.toUpperCase(), 'UK');
    assert.equal(Number(args.foundedYearFrom), 2018);
    assert.equal(Number(args.foundedYearTo), 2020);
    const baseline = await member.get('/dashboard?country=UK&foundedYearFrom=2018&foundedYearTo=2020');
    assert.equal(baseline.summary.totalRevenue, 1782);
    assert.equal(last.type, 'report');
    assert.deepEqual(last.content.report.summary, baseline.summary);
    assert.deepEqual(last.content.report.levelDistribution, baseline.levelDistribution);
    const dialog = member.page.getByRole('dialog');
    await dialog.getByText('总收入', { exact: true }).waitFor();
    await dialog.getByTitle('1,782', { exact: true }).waitFor();
    await dialog.getByRole('img', { name: '公司等级占比环形图' }).waitFor();
    const table = dialog.getByRole('table', { name: '公司等级分布数据' });
    assert.deepEqual(await table.locator('tbody td').allTextContents(),
      baseline.levelDistribution.flatMap(r => ['Level ' + r.level, String(r.count), r.percentage.toFixed(2) + '%']));
    return '总收入 1,782，等级 2/3/4 占比 40%/40%/20%';
  });

  const count = userList.mock.callCount();
  await check(member, denied, async ({ last }) => {
    assert.equal(last.type, 'tool-error');
    assert.equal(last.content.message, '你没有权限执行此查询。');
    assert.equal(userList.mock.callCount(), count);
    const page = member.page;
    const notice = page.getByRole('alert').getByText(last.content.message, { exact: true });
    await notice.waitFor();
    await page.reload();
    await page.getByRole('button', { name: '打开 AI 助手' }).click();
    await notice.waitFor();
    assert.equal(await page.getByRole('table', { name: '用户查询结果' }).count(), 0);
    const history = await member.get('/ai-agent/sessions/' + member.session.id + '/messages');
    assert.deepEqual(history.items.at(-1).content.data, null);
    assert.equal(history.items.at(-1).content.code, 'FORBIDDEN');
    assert.ok(history.items.every(m => m.content.data?.tableType !== 'users'));
    assert.doesNotMatch(JSON.stringify(history.items), /@example\.test/);
    return '权限提示，刷新与历史均无用户明细，用户列表调用增量 0';
  });

  if (mode === 'fixture') {
    await check(member, empty, async ({ last }) => {
      assert.deepEqual(last.content.companies, []);
      assert.equal(last.content.total, 0);
      await member.page.getByText(/公司表 · 没有符合条件的记录。共 0 条/).waitFor();
      return '没有符合条件的记录，共 0 条';
    });
  }
  assert.equal(failures.length, 0, '未通过的指令：' + failures.join(' / '));
}
