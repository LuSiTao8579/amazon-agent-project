import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const backendRequire = createRequire(new URL('../../bknd/package.json', import.meta.url));
const { config } = backendRequire('dotenv');
const { Client } = backendRequire('pg');
config({ path: fileURLToPath(new URL('../../bknd/.env', import.meta.url)), quiet: true });
const base = 'http://127.0.0.1:3000';
const email = `step4-http-${randomUUID()}@example.test`;
const password = '  A long passphrase! 🔑  ';
const cookieName = 'supply_chain_session';
async function post(path, body, headers = {}) {
  return fetch(base + path, {
    method: 'POST',
    headers: { Origin: base, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
}

test('real Next → Nest → PostgreSQL authentication flow', async (t) => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  let cookie;
  let id;
  try {
    await t.test('rejects cross-origin and missing-origin POSTs', async () => {
      assert.equal((await post('/api/auth/login', {}, { Origin: 'https://untrusted.example' })).status, 403);
      const result = await fetch(base + '/api/auth/logout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      assert.equal(result.status, 403);
    });
    await t.test('rejects non-JSON and malformed bodies', async () => {
      assert.equal((await post('/api/auth/login', {}, { 'Content-Type': 'text/plain' })).status, 415);
      const result = await fetch(base + '/api/auth/signup', {
        method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{',
      });
      assert.equal(result.status, 400);
    });
    await t.test('backend validation still rejects invalid input and extra fields', async () => {
      const emptyResult = await post('/api/auth/signup', { email: '', password: '' });
      assert.equal(emptyResult.status, 400);
      assert.match((await emptyResult.json()).message, /邮箱/);
      const result = await post('/api/auth/signup', { email: 'bad', password: 'short' });
      assert.equal(result.status, 400);
      assert.match((await result.json()).message, /邮箱/);
      assert.equal((await post('/api/auth/signup', { email, password, role: 'admin' })).status, 400);
    });
    await t.test('all workspace pages require authentication', async () => {
      for (const path of ['/dashboard', '/company', '/order', '/user']) {
        const result = await fetch(base + path, { redirect: 'manual' });
        assert.equal(result.status, 307);
        assert.equal(new URL(result.headers.get('location'), base).pathname, '/login');
      }
      assert.equal((await fetch(base + '/api/auth/me')).status, 401);
    });
    await t.test('registration returns actual success and public user, not a token, and stores Argon2id in PostgreSQL', async () => {
      const result = await post('/api/auth/signup', { email: ' ' + email.toUpperCase() + ' ', password });
      assert.equal(result.status, 201);
      assert.equal(result.headers.get('cache-control'), 'no-store');
      const body = await result.json();
      assert.equal(body.message, '注册成功，请登录');
      assert.equal(body.user.email, email);
      assert.equal('accessToken' in body, false);
      assert.equal('password' in body.user, false);
      assert.equal('passwordHash' in body.user, false);
      assert.equal(JSON.stringify(body).includes(password), false);
      id = body.user.id;
      const { rows } = await db.query('SELECT email, password_hash FROM users WHERE id = $1', [id]);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].email, email);
      assert.match(rows[0].password_hash, /^\$argon2id\$/);
      assert.equal(rows[0].password_hash.includes(password), false);
    });
    await t.test('duplicate registration is 409', async () => {
      const result = await post('/api/auth/signup', { email, password });
      assert.equal(result.status, 409);
      assert.equal((await result.json()).message, '该邮箱已注册');
    });
    await t.test('unknown email and wrong password have identical messages', async () => {
      const first = await post('/api/auth/login', { email, password: 'wrong-password' });
      const second = await post('/api/auth/login', { email: 'missing-' + email, password });
      assert.equal(first.status, 401);
      assert.equal(second.status, 401);
      assert.deepEqual(await first.json(), await second.json());
    });
    await t.test('login uses HttpOnly cookie, no token in JSON; whitespace password is preserved', async () => {
      const result = await post('/api/auth/login', { email, password });
      assert.equal(result.status, 200);
      const header = result.headers.get('set-cookie');
      assert.ok(header?.includes('HttpOnly'));
      assert.match(header, /SameSite=lax/i);
      assert.match(header, /Max-Age=900/i);
      assert.match(header, /Path=\//i);
      cookie = header.split(';')[0];
      assert.ok(cookie.startsWith(cookieName + '='));
      const body = await result.json();
      assert.equal('accessToken' in body, false);
      assert.equal(body.user.id, id);
    });
    await t.test('cookie restores identity and renders shared navigation across all four workspace pages', async () => {
      assert.ok(cookie, 'login must succeed before checking session');
      const result = await fetch(base + '/api/auth/me', { headers: { Cookie: cookie } });
      assert.equal(result.status, 200);
      assert.equal((await result.json()).id, id);

      const escapedEmail = new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const expectedPages = [
        ['/dashboard', 'Dashboard', '数据总览'],
        ['/company', 'Company', '供应链公司'],
        ['/order', 'Order', '订单追踪'],
        ['/user', 'User', '用户与账户'],
      ];
      for (const [path, title, subtitle] of expectedPages) {
        const page = await fetch(base + path, { headers: { Cookie: cookie } });
        assert.equal(page.status, 200);
        const html = await page.text();
        assert.match(html, escapedEmail);
        assert.match(html, /aria-label="工作台导航"/);
        if (path === '/user') assert.match(html, /用户管理仅对管理员开放/);
        else if (path === '/company') assert.match(html, /公司表格/);
        else {
          assert.match(html, new RegExp(`>${title}</h1>`));
          assert.match(html, new RegExp(`>${subtitle}</h2>`));
        }
        assert.match(html, new RegExp(`href="${path}"[^>]*aria-current="page"|aria-current="page"[^>]*href="${path}"`));
      }
    });
    await t.test('invalid cookie returns 401 and expires the browser cookie', async () => {
      const result = await fetch(base + '/api/auth/me', { headers: { Cookie: cookieName + '=invalid' } });
      assert.equal(result.status, 401);
      assert.match(result.headers.get('set-cookie'), /Max-Age=0/i);
      const page = await fetch(base + '/dashboard', {
        headers: { Cookie: cookieName + '=invalid' },
        redirect: 'manual',
      });
      assert.equal(page.status, 307);
      assert.equal(new URL(page.headers.get('location'), base).pathname, '/login');
    });
    await t.test('logout expires cookie; subsequent no-cookie request is unauthorized', async () => {
      const result = await post('/api/auth/logout', {}, { Cookie: cookie });
      assert.equal(result.status, 200);
      assert.match(result.headers.get('set-cookie'), /Max-Age=0/i);
      assert.equal((await fetch(base + '/api/auth/me')).status, 401);
    });
    await t.test('deleted real user cannot use an earlier valid cookie', async () => {
      assert.ok(id);
      await db.query('DELETE FROM users WHERE id = $1 AND email = $2', [id, email]);
      const result = await fetch(base + '/api/auth/me', { headers: { Cookie: cookie } });
      assert.equal(result.status, 401);
    });
  } finally {
    // Delete only the unique synthetic account created by this test run.
    await db.query('DELETE FROM users WHERE email = $1', [email]);
    await db.end();
  }
});
