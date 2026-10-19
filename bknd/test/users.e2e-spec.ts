import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { AppModule } from '../src/app.module.js';
import { PG_POOL } from '../src/database/database.module.js';
import { PasswordHasher } from '../src/users/password-hasher.service.js';
import { UsersService } from '../src/users/users.service.js';

// 需要先 `docker compose up -d --wait` 并执行 `npm run db:migrate`。
// 使用真实 PostgreSQL；只操作 @example.test 测试邮箱，结束后删除。
describe('Users table (PostgreSQL)', () => {
  let moduleRef: TestingModule;
  let users: UsersService;
  let hasher: PasswordHasher;
  let pool: pg.Pool;
  const testEmail = () => `step2-${randomUUID()}@example.test`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await moduleRef.init();
    users = moduleRef.get(UsersService);
    hasher = moduleRef.get(PasswordHasher);
    pool = moduleRef.get(PG_POOL);
  });
  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE 'step2-%@example.test'`);
    await moduleRef.close();
  });

  it('creates a user and stores only an Argon2id hash', async () => {
    const email = testEmail();
    const password = 'Correct-horse!@ 9';
    const created = await users.create({
      email,
      passwordHash: await hasher.hash(password),
    });

    expect(created).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      email,
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
    expect(created).not.toHaveProperty('passwordHash');

    const { rows } = await pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [created.id],
    );
    expect(rows[0].password_hash).toMatch(/^\$argon2id\$/);
    expect(rows[0].password_hash).not.toContain(password);
  });

  it('finds users by email (case-insensitive) and by id', async () => {
    const email = testEmail();
    const created = await users.create({
      email: `  ${email.toUpperCase()} `,
      passwordHash: await hasher.hash('Password123!'),
    });
    expect(created.email).toBe(email);

    expect(await users.findByEmail(email.toUpperCase())).toEqual(created);
    expect(await users.findById(created.id)).toEqual(created);
    expect(await users.findByEmail(testEmail())).toBeNull();
    expect(await users.findById(randomUUID())).toBeNull();
    expect(await users.findById('not-a-uuid')).toBeNull();
  });

  it('rejects duplicate emails, including different letter case', async () => {
    const email = testEmail();
    const passwordHash = await hasher.hash('Password123!');
    await users.create({ email, passwordHash });

    await expect(users.create({ email, passwordHash })).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(
      users.create({ email: email.toUpperCase(), passwordHash }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows only one of two concurrent signups with the same email', async () => {
    const email = testEmail();
    const passwordHash = await hasher.hash('Password123!');
    const results = await Promise.allSettled([
      users.create({ email, passwordHash }),
      users.create({ email, passwordHash }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected?.reason).toBeInstanceOf(ConflictException);
  });

  it('verifies the right password and rejects the wrong one', async () => {
    const email = testEmail();
    const password = 'Secret!@#456';
    await users.create({ email, passwordHash: await hasher.hash(password) });

    const credentials = await users.findCredentialsByEmail(email);
    expect(credentials).not.toBeNull();
    expect(await hasher.verify(credentials!.passwordHash, password)).toBe(true);
    expect(await hasher.verify(credentials!.passwordHash, 'Secret!@#45')).toBe(
      false,
    );
    expect(await users.findCredentialsByEmail(testEmail())).toBeNull();
  });

  it('database refuses plaintext passwords even if service code is bypassed', async () => {
    await expect(
      pool.query('INSERT INTO users (email, password_hash) VALUES ($1, $2)', [
        testEmail(),
        'plain-text-password',
      ]),
    ).rejects.toMatchObject({ constraint: 'users_password_hash_format_chk' });
  });

  it('refreshes updated_at automatically on update', async () => {
    const created = await users.create({
      email: testEmail(),
      passwordHash: await hasher.hash('Password123!'),
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const { rows } = await pool.query<{ updatedAt: Date }>(
      `UPDATE users SET password_hash = password_hash WHERE id = $1
       RETURNING updated_at AS "updatedAt"`,
      [created.id],
    );
    expect(rows[0].updatedAt.getTime()).toBeGreaterThan(
      created.updatedAt.getTime(),
    );
  });
});
