import test from 'node:test';
import assert from 'node:assert/strict';
import { examples } from '../../contracts/tool-result.examples.ts';
import { revenuePerEmployeeDisplay } from '../src/components/revenue-per-employee.ts';
import { normalizeMessage } from '../src/features/ai-chat/normalize-message.ts';

const base = { id: '1', role: 'assistant', createdAt: '2026-01-01T00:00:00Z', turnStatus: 'completed' };
test('text keeps only the display content and turn status', () => {
  const result = normalizeMessage({ ...base, messageType: 'text', content: { text: '# 你好', secret: 'private' }, token: 'private' });
  assert.deepEqual(result, { ...base, type: 'text', content: { text: '# 你好' } });
});
test('known future types retain their type but do not expose unrelated data', () => {
  for (const type of ['table', 'chart', 'report', 'confirmation']) {
    const result = normalizeMessage({ ...base, messageType: type, content: { title: '标题', privateData: 'secret' } });
    assert.equal(result.type, type);
    assert.deepEqual(result.content, { title: '标题' });
  }
});
test('unknown and malformed messages are visible placeholders', () => {
  assert.equal(normalizeMessage({ ...base, messageType: 'future', content: {} }).type, 'unsupported');
  assert.equal(normalizeMessage({ ...base, messageType: 'text', content: { text: 42 } }).type, 'unsupported');
  assert.throws(() => normalizeMessage({ ...base, role: 'system' }));
});

test('attachment metadata is whitelisted and checked before display', () => {
  const id = '39b56ffd-72f4-4897-8d4a-cead9c935d23';
  const result = normalizeMessage({ ...base, messageType:'text', content:{text:'上传成功'}, attachments:[
    {id, name:'test.csv', size:'12', storageKey:'private'}, {id:'invalid', name:'bad', size:20},
  ]});
  assert.deepEqual(result.attachments, [{id, name:'test.csv', size:12}]);
});


test('固定样例通过历史消息入口区分文本、两种表格、单图和报表', () => {
  for (const [key, expectedTitle] of [['text', undefined], ['users', '用户表'], ['companies', '公司表'],
    ['chart', '公司成立年份累计趋势'], ['report', 'Dashboard']]) {
    const content = examples[key];
    const message = normalizeMessage({ ...base, messageType: content.resultType, content });
    assert.equal(message.type, content.resultType);
    assert.equal(message.content.title, expectedTitle);
    if (key === 'text') assert.equal(message.content.text, content.data.text);
    else assert.ok(message.content.summary);
  }
});
test('零匹配、超出最后一页、工具失败与损坏的结果分别展示', () => {
  const read = content => normalizeMessage({ ...base, messageType: content.resultType, content });
  assert.deepEqual(read(examples.empty).content, { title: '公司表', summary: '没有符合条件的记录。' });
  const laterPage = { ...examples.empty, data: { ...examples.empty.data, total: 3, page: 2 } };
  assert.match(read(laterPage).content.summary, /共 3 条，第 2 页显示 0 条/);
  for (const content of [examples.disabled, examples.forbidden]) {
    assert.equal(read(content).type, 'tool-error');
    assert.equal(read(content).content.message, content.message);
  }
  assert.equal(read({ ...examples.empty, data: null }).type, 'unsupported');
});

test('公司消息保留可展开字段，过滤额外字段，拒绝缺失计算值和重复行标识', () => {
  const row = examples.companies.data.items[0];
  const read = items => normalizeMessage({ ...base, messageType: 'table', content: {
    ...examples.companies, data: { ...examples.companies.data, items, total: items.length },
  } });
  const zero = { ...row, companyCode: 'ZERO', employees: 0, revenuePerEmployee: null };
  assert.deepEqual(read([{ ...row, secret: 'private' }, zero]).content.companies, [row, zero]);
  assert.equal(read([{ ...row, revenuePerEmployee: undefined }]).type, 'unsupported');
  assert.equal(read([row, row]).type, 'unsupported');
});
test('公司页与聊天使用相同的人均年营收色阶，以原始值判定边界', () => {
  for (const [value, color] of [[0, '#fff3e0'], [99.999, '#fff3e0'], [100, '#e3f2fd'],
    [499.999, '#e3f2fd'], [500, '#e8f5e9']]) {
    assert.equal(revenuePerEmployeeDisplay(value).bgcolor, color);
  }
  assert.deepEqual(revenuePerEmployeeDisplay(null), { label: '不可计算', bgcolor: 'action.disabledBackground' });
});

test('历史恢复保留用户字段、两种图的全部数据点和组合报表，并剔除额外字段', () => {
  const read = content => normalizeMessage({ ...base, messageType: content.resultType, content });
  const users = structuredClone(examples.users);
  users.data.items[0].privateField = 'secret';
  assert.deepEqual(read(users).content.users, examples.users.data.items);
  for (const [chartType, rows] of Object.entries({
    yearlyGrowth: examples.report.data.yearlyGrowth, levelDistribution: examples.report.data.levelDistribution,
  })) {
    const chart = { ...examples.chart, data: { chartType, rows } };
    assert.deepEqual(read(chart).content.chart, chart.data);
  }
  const report = structuredClone(examples.report);
  report.data.levelDistribution[0].privateField = 'secret';
  assert.deepEqual(read(report).content.report, examples.report.data);
  delete report.data.yearlyGrowth[0].newCompanies;
  assert.equal(read(report).type, 'unsupported');
});
