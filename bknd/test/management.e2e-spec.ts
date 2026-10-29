import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/setup-app.js';
import { PG_POOL } from '../src/database/database.module.js';
import { PasswordHasher } from '../src/users/password-hasher.service.js';
import { UsersService } from '../src/users/users.service.js';

describe('用户与公司管理 API', () => {
  let app: INestApplication<App>;
  let pool: pg.Pool;
  let adminToken: string;
  let memberToken: string;
  const prefix = randomUUID();
  const emails = [`admin-${prefix}@example.test`, `member-${prefix}@example.test`, `new-${prefix}@example.test`];
  const code = `test-${prefix}`;
  beforeAll(async () => {
    const fixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = fixture.createNestApplication();
    setupApp(app);
    await app.init();
    pool = app.get(PG_POOL);
    const hash = await app.get(PasswordHasher).hash('A valid test password!');
    const users = app.get(UsersService);
    const admin = await users.create({ email: emails[0], passwordHash: hash });
    const member = await users.create({ email: emails[1], passwordHash: hash });
    await pool.query('UPDATE users SET is_admin = true WHERE id = $1', [admin.id]);
    adminToken = await app.get(JwtService).signAsync({ sub: admin.id });
    memberToken = await app.get(JwtService).signAsync({ sub: member.id });
  });
  afterAll(async () => {
    // 只删除本次测试生成的独立数据。
    if (pool) {
      await pool.query('DELETE FROM relationships WHERE company_code = $1', [code]);
      await pool.query('DELETE FROM companies WHERE company_code = $1', [code]);
      await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [emails]);
    }
    await app?.close();
  });
  it('限制管理权限并完成用户增查改删', async () => {
    const server = app.getHttpServer();
    await request(server).get('/users').expect(401);
    await request(server).get('/users').auth(memberToken, { type: 'bearer' }).expect(403);
    const created = await request(server).post('/users').auth(adminToken, { type: 'bearer' })
      .send({ email: emails[2], password: 'A valid test password!', name: 'Test Person', role: 'Analyst', status: 'active' }).expect(201);
    expect(created.body).not.toHaveProperty('passwordHash');
    const id = created.body.id;
    const list = await request(server).get('/users?search=Test%20Person&roles=Analyst').auth(adminToken, { type: 'bearer' }).expect(200);
    expect(list.body.items.some((user: { id: string }) => user.id === id)).toBe(true);
    await request(server).patch(`/users/${id}`).auth(adminToken, { type: 'bearer' }).send({ status: 'inactive' }).expect(200);
    await request(server).post('/users/bulk-delete').auth(adminToken, { type: 'bearer' }).send({ ids: [id] }).expect(200);
    await request(server).get(`/users/${id}`).auth(adminToken, { type: 'bearer' }).expect(404);
  });
  it('公司可查询，写入需管理员，关联公司受保护', async () => {
    const server = app.getHttpServer();
    const company = { companyCode: code, companyName: 'Test Company', level: 2, country: 'UK', city: 'London', foundedYear: 2000, annualRevenue: 100, employees: 2 };
    await request(server).post('/companies').auth(memberToken, { type: 'bearer' }).send(company).expect(403);
    const created = await request(server).post('/companies').auth(adminToken, { type: 'bearer' }).send(company).expect(201);
    expect(created.body.revenuePerEmployee).toBe(50);
    await request(server).get('/companies?search=Test%20Company&levels=2').auth(memberToken, { type: 'bearer' }).expect(200);
    await request(server).patch(`/companies/${code}`).auth(adminToken, { type: 'bearer' }).send({ employees: 0 }).expect(200);
    const read = await request(server).get(`/companies/${code}`).auth(memberToken, { type: 'bearer' }).expect(200);
    expect(read.body.revenuePerEmployee).toBeNull();
    await pool.query('INSERT INTO relationships (company_code) VALUES ($1)', [code]);
    await request(server).delete(`/companies/${code}`).auth(adminToken, { type: 'bearer' }).expect(409);
    await pool.query('DELETE FROM relationships WHERE company_code = $1', [code]);
    await request(server).delete(`/companies/${code}`).auth(adminToken, { type: 'bearer' }).expect(200);
  });
});
