import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';

describe('Backend environment', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
    await app.init();
    jwt = app.get(JwtService);
  });
  afterAll(async () => {
    await app.close();
  });

  it('serves the initial endpoint', async () => {
    await request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
  it('reports process health', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok', service: 'bknd' });
  });
  it('rejects missing token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });
  it('rejects invalid token', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer invalid')
      .expect(401);
  });
  it('accepts a valid signed token', async () => {
    const token = await jwt.signAsync({ sub: 'test-user' });
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect({ subject: 'test-user' });
  });
  it('rejects expired tokens', async () => {
    const token = await jwt.signAsync({ sub: 'test-user' }, { expiresIn: -1 });
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });
  it('rejects wrong audience', async () => {
    const token = await jwt.signAsync(
      { sub: 'test-user' },
      { audience: 'other-app' },
    );
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });
});
