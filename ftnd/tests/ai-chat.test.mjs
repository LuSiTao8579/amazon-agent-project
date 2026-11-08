import test from 'node:test';
import assert from 'node:assert/strict';
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
