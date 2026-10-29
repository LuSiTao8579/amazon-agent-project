import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JWT_AUDIENCE, JWT_ISSUER } from '../src/auth/auth.constants.js';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/setup-app.js';
import { PG_POOL } from '../src/database/database.module.js';
import { PasswordHasher } from '../src/users/password-hasher.service.js';
import { UsersService } from '../src/users/users.service.js';

describe('Authentication API (real PostgreSQL)', () => {
  let app: INestApplication<App>;
  let pool: pg.Pool;
  let jwt: JwtService;
  const emails: string[] = [];
  const password = '  Correct horse! 海马 9  ';
  const nextEmail = () => {
    const email = `step3-${randomUUID()}@example.test`;
    emails.push(email);
    return email;
  };

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
    setupApp(app);
    await app.init();
    pool = app.get(PG_POOL);
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    try {
      // Only this test run's exact addresses; never remove another run's data.
      if (pool)
        await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [
          emails,
        ]);
    } finally {
      await app?.close();
    }
  });

  async function register(email = nextEmail(), secret = password) {
    return request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email, password: secret })
      .expect(201);
  }
  async function login(email: string, secret = password) {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: secret })
      .expect(200);
  }

  it('registers, stores Argon2id, and does not automatically log in', async () => {
    const email = nextEmail();
    const result = await register(`  ${email.toUpperCase()}  `);
    expect(result.body.message).toBe('注册成功，请登录');
    expect(result.body).not.toHaveProperty('accessToken');
    expect(result.headers['cache-control']).toBe('no-store');
    expect(Object.keys(result.body.user).sort()).toEqual([
      'createdAt',
      'email',
      'id',
      'isAdmin',
      'name',
      'role',
      'status',
      'updatedAt',
    ]);
    expect(result.body.user.email).toBe(email);
    const { rows } = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [result.body.user.id],
    );
    expect(rows[0].password_hash).toMatch(/^\$argon2id\$/);
    expect(JSON.stringify(result.body)).not.toContain(password);
    expect(
      await app.get(PasswordHasher).verify(rows[0].password_hash, password),
    ).toBe(true);
  });

  it('logs in and returns the same real user from /auth/me', async () => {
    const email = nextEmail();
    const created = await register(email);
    const signedIn = await login(`  ${email.toUpperCase()}  `);
    expect(signedIn.body.user).toEqual(created.body.user);
    expect(signedIn.body.tokenType).toBe('Bearer');
    expect(signedIn.body.expiresIn).toBe(900);
    expect(signedIn.headers['cache-control']).toBe('no-store');
    expect(signedIn.headers['set-cookie']).toBeUndefined();
    const claims = await jwt.verifyAsync(signedIn.body.accessToken);
    expect(claims.sub).toBe(created.body.user.id);
    expect(claims.exp - claims.iat).toBe(900);
    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${signedIn.body.accessToken}`)
      .expect(200);
    expect(me.body).toEqual(created.body.user);
    expect(me.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(me.body)).not.toMatch(/password|argon2/i);
  });

  it('preserves password spaces and returns identical errors for missing user and wrong password', async () => {
    const email = nextEmail();
    await register(email);
    const wrong = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: password.trim() })
      .expect(401);
    const missing = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: nextEmail(), password })
      .expect(401);
    expect(wrong.body).toEqual(missing.body);
    expect(wrong.body.message).toBe('邮箱或密码错误');
    expect(wrong.body).not.toHaveProperty('accessToken');
  });

  it('rejects duplicate emails including normalized variants', async () => {
    const email = nextEmail();
    await register(email);
    const result = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: ` ${email.toUpperCase()} `, password })
      .expect(409);
    expect(result.body.message).toBe('该邮箱已注册');
  });

  it('allows only one concurrent registration for the same email', async () => {
    const email = nextEmail();
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post('/auth/signup')
          .send({ email, password }),
      ),
    );
    expect(
      results.map((result) => result.status).sort((a, b) => a - b),
    ).toEqual([201, 409]);
    const { rows } = await pool.query(
      'SELECT count(*)::int AS count FROM users WHERE email = $1',
      [email],
    );
    expect(rows[0].count).toBe(1);
  });

  const invalidBodies = [
    ['empty body', {}],
    ['empty email', { email: '', password }],
    ['malformed email', { email: 'not-an-email', password }],
    ['email object', { email: { value: 'a@example.test' }, password }],
    ['email array', { email: ['a@example.test'], password }],
    ['missing password', { email: 'a@example.test' }],
    ['empty password', { email: 'a@example.test', password: '' }],
    ['password number', { email: 'a@example.test', password: 123456789012345 }],
    ['password object', { email: 'a@example.test', password: {} }],
    [
      'oversized password',
      { email: 'a@example.test', password: 'a'.repeat(129) },
    ],
    ['oversized email', { email: `${'a'.repeat(255)}@example.test`, password }],
    [
      'unapproved role field',
      { email: 'a@example.test', password, role: 'admin' },
    ],
    ['array body', []],
  ] as const;

  for (const path of ['/auth/signup', '/auth/login']) {
    it.each(invalidBodies)(`${path} rejects %s`, async (_name, body) => {
      const result = await request(app.getHttpServer())
        .post(path)
        .send(body)
        .expect(400);
      expect(result.body.statusCode).toBe(400);
      expect(JSON.stringify(result.body)).not.toContain(password);
    });
  }

  it.each(['a'.repeat(14), ' '.repeat(15)])(
    'rejects insufficient registration password %j',
    async (secret) => {
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: nextEmail(), password: secret })
        .expect(400);
    },
  );

  it.each([15, 128])(
    'accepts a registration password of %i characters',
    async (length) => {
      const email = nextEmail();
      const secret = 'a'.repeat(length);
      await register(email, secret);
      await login(email, secret);
    },
  );

  it('still verifies an existing shorter password created in step 2', async () => {
    const email = nextEmail();
    await app.get(UsersService).create({
      email,
      passwordHash: await app.get(PasswordHasher).hash('Old-pass!'),
    });
    await login(email, 'Old-pass!');
  });

  it('rejects a token after its own test user has been deleted', async () => {
    const email = nextEmail();
    const created = await register(email);
    const signedIn = await login(email);
    await pool.query('DELETE FROM users WHERE id = $1 AND email = $2', [
      created.body.user.id,
      email,
    ]);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${signedIn.body.accessToken}`)
      .expect(401);
  });

  it('rejects forged, expired, wrong-issuer, wrong-audience and wrong-algorithm tokens', async () => {
    const created = await register();
    const sub = created.body.user.id;
    const tokens = [
      await new JwtService({
        secret: 'a-different-test-only-signing-secret',
      }).signAsync({ sub }),
      await jwt.signAsync({ sub }, { expiresIn: -1 }),
      await jwt.signAsync({ sub }, { issuer: 'other-service' }),
      await jwt.signAsync({ sub }, { audience: 'other-client' }),
      await jwt.signAsync({ sub }, { algorithm: 'HS384' }),
      await new JwtService({
        secret: app.get(ConfigService).getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          algorithm: 'HS256',
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
      }).signAsync({ sub }),
      await jwt.signAsync({ sub: randomUUID() }),
      await jwt.signAsync({ sub: 123 }),
    ];
    for (const token of tokens) {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    }
  });

  it('publishes request schemas, response schemas and Bearer auth in Swagger', async () => {
    const result = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    expect(result.body.paths['/auth/signup'].post.responses).toHaveProperty(
      '201',
    );
    expect(result.body.paths['/auth/signup'].post.responses).toHaveProperty(
      '409',
    );
    expect(result.body.paths['/auth/login'].post.responses).toHaveProperty(
      '200',
    );
    expect(result.body.paths['/auth/me'].get.security).toEqual([
      { bearer: [] },
    ]);
    expect(
      result.body.components.schemas.SignupDto.properties.password.minLength,
    ).toBe(15);
    expect(
      result.body.components.schemas.PublicUserDto.properties,
    ).not.toHaveProperty('passwordHash');
  });
});
