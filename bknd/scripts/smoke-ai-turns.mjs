import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../dist/app.module.js';
import { setupApp } from '../dist/setup-app.js';
import { PG_POOL } from '../dist/database/database.module.js';
import { UsersService } from '../dist/users/users.service.js';
import { PasswordHasher } from '../dist/users/password-hasher.service.js';

// 仅使用合成数据；实际调用两次模型，结束后按外键顺序清理测试账号和会话。
const email = `ai-turn-smoke-${randomUUID()}@example.test`;
let app;
let pool;
let session;
try {
  app = await NestFactory.create(AppModule,{logger:false});
  setupApp(app);
  await app.init();
  pool = app.get(PG_POOL);
  const hash=await app.get(PasswordHasher).hash(randomUUID());
  const user=await app.get(UsersService).create({email,passwordHash:hash});
  const token=await app.get(JwtService).signAsync({sub:user.id});
  const server=app.getHttpServer();
  const created=await request(server).post('/ai-agent/sessions').auth(token,{type:'bearer'}).send({title:'临时联调'}).expect(201);
  session=created.body.id;
  const endpoint=`/ai-agent/sessions/${session}/turns`;
  const first=await request(server).post(endpoint).auth(token,{type:'bearer'})
    .send({requestId:randomUUID(),text:'请记住这个测试代号：青枫蓝鲸。请只回答“已记住”。'}).expect(201);
  assert.ok(first.body.assistantMessage.content.text);
  const second=await request(server).post(endpoint).auth(token,{type:'bearer'})
    .send({requestId:randomUUID(),text:'刚才的测试代号是什么？请只回答代号。'}).expect(201);
  assert.ok(second.body.assistantMessage.content.text.includes('青枫蓝鲸'),'第二轮回复没有包含测试代号');
  const history=await request(server).get(`/ai-agent/sessions/${session}/messages`).auth(token,{type:'bearer'}).expect(200);
  assert.equal(history.body.items.length,4);
  assert.equal(history.body.items[0].turnStatus,'completed');
  console.log('千问两轮对话与历史读取成功；测试使用合成内容。');
} catch(error) {
  console.error('千问对话联调未通过：', error.message);
  process.exitCode=1;
} finally {
  try {
    if (pool && session) {
      await pool.query('DELETE FROM ai_chat_turns WHERE session_id=$1',[session]);
      await pool.query('DELETE FROM ai_chat_messages WHERE session_id=$1',[session]);
      await pool.query('DELETE FROM ai_chat_sessions WHERE id=$1',[session]);
    }
    if (pool) await pool.query('DELETE FROM users WHERE email=$1',[email]);
  } finally { await app?.close(); }
}
