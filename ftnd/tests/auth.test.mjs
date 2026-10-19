import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmail, validateCredentials } from '../src/lib/auth-validation.ts';
import { errorMessage, isPublicUser, publicUser } from '../src/lib/auth-contract.ts';

const valid = { email: 'learner@example.test', password: 'Long password! 123' };
const cases = [
  ['empty email', 'signup', { email: '' }, 'email'],
  ['blank email', 'login', { email: '  ' }, 'email'],
  ['malformed email', 'signup', { email: 'not-an-email' }, 'email'],
  ['local-only domain', 'signup', { email: 'a@localhost' }, 'email'],
  ['embedded whitespace', 'signup', { email: 'a b@example.test' }, 'email'],
  ['long email', 'signup', { email: 'a'.repeat(250) + '@example.test' }, 'email'],
  ['empty password', 'signup', { password: '' }, 'password'],
  ['empty login password', 'login', { password: '' }, 'password'],
  ['14 characters', 'signup', { password: 'x'.repeat(14) }, 'password'],
  ['129 characters', 'signup', { password: 'x'.repeat(129) }, 'password'],
  ['long login password', 'login', { password: 'x'.repeat(129) }, 'password'],
  ['all spaces', 'signup', { password: ' '.repeat(15) }, 'password'],
  ['15 characters', 'signup', { password: 'x'.repeat(15) }, null],
  ['128 characters', 'signup', { password: 'x'.repeat(128) }, null],
  ['Unicode codepoints', 'signup', { password: '🔑'.repeat(15) }, null],
  ['Unicode upper boundary', 'signup', { password: '🔑'.repeat(128) }, null],
  ['Unicode too short', 'signup', { password: '🔑'.repeat(14) }, 'password'],
  ['symbols and Chinese', 'signup', { password: '中文!@#$%^&*()password' }, null],
  ['leading/trailing spaces', 'signup', { password: '  secure passphrase  ' }, null],
  ['old short password', 'login', { password: 'old' }, null],
];
for (const [name, mode, overrides, errorField] of cases) {
  test(name, () => {
    const input = { ...valid, ...overrides };
    const original = { ...input };
    const errors = validateCredentials(mode, input);
    if (errorField) assert.ok(errors[errorField]);
    else assert.deepEqual(errors, {});
    assert.deepEqual(input, original, 'validation must not modify passwords');
  });
}
test('email normalization is shared in both flows', () => {
  assert.equal(normalizeEmail(' User@Example.TEST '), 'user@example.test');
  assert.deepEqual(validateCredentials('signup', { ...valid, email: ' User@Example.TEST ' }), {});
});
test('API messages support Nest arrays and safe fallbacks', () => {
  assert.equal(errorMessage({ message: ['邮箱错误', '密码太短'] }, 'fallback'), '邮箱错误；密码太短');
  assert.equal(errorMessage({ message: '该邮箱已注册' }, 'fallback'), '该邮箱已注册');
  assert.equal(errorMessage({ message: [42] }, 'fallback'), 'fallback');
  assert.equal(errorMessage(null, 'fallback'), 'fallback');
});
test('only public user fields survive serialization', () => {
  const user = { id: 'test', email: valid.email, createdAt: 'now', updatedAt: 'now', passwordHash: 'secret' };
  assert.equal(isPublicUser(user), true);
  assert.equal(isPublicUser({ email: 'missing-fields' }), false);
  assert.equal('passwordHash' in publicUser(user), false);
});
