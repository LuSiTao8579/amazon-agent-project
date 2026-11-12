import { type INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/setup-app.js';
import { PG_POOL } from '../src/database/database.module.js';
import { UsersService } from '../src/users/users.service.js';
import { PasswordHasher } from '../src/users/password-hasher.service.js';
import { ModelService } from '../src/ai-agent/providers/model.service.js';
import { ModelError } from '../src/ai-agent/providers/chat-model.types.js';
import { AiCacheService } from '../src/ai/cache/ai-cache.service.js';
import { ChatTurnRepository } from '../src/ai-agent/chat-turn.repository.js';

describe('AI多轮对话 HTTP 与数据库', () => {
  let app:INestApplication<App>;
  let pool:pg.Pool;
  let token:string;
  let otherToken:string;
  let userId: string;
  let otherUserId: string;
  const emails=[`turn-a-${randomUUID()}@example.test`,`turn-b-${randomUUID()}@example.test`];
  const sessions:string[]=[];
  const reply={provider:'qwen' as const,model:'fake',text:'模拟回复',finishReason:'stop'};
  const chat=vi.fn(async (_messages:unknown[])=>reply);
  const key = (sessionId: string) => ({ kind: 'session', userId, sessionId }) as const;
  function send(session: string, text: string) {
    return request(app.getHttpServer()).post(`/ai-agent/sessions/${session}/turns`)
      .auth(token, { type: 'bearer' }).send({ requestId: randomUUID(), text }).expect(201);
  }
  async function createSession() {
    const result=await request(app.getHttpServer()).post('/ai-agent/sessions').auth(token,{type:'bearer'}).send({title:'自动化测试'}).expect(201);
    sessions.push(result.body.id);
    return result.body.id as string;
  }
  beforeAll(async ()=>{
    const module=await Test.createTestingModule({imports:[AppModule]})
      .overrideProvider(ModelService).useValue({chat}).compile();
    app=module.createNestApplication();
    setupApp(app);
    await app.init();
    pool=app.get(PG_POOL);
    const users=app.get(UsersService);
    const passwordHash=await app.get(PasswordHasher).hash('temporary-test-password');
    const user=await users.create({email:emails[0],passwordHash});
    const other=await users.create({email:emails[1],passwordHash});
    userId = user.id;
    otherUserId = other.id;
    token=await app.get(JwtService).signAsync({sub:user.id});
    otherToken=await app.get(JwtService).signAsync({sub:other.id});
  });
  afterAll(async ()=>{
    try {
      if(pool) {
        for (const session of sessions) await app.get(AiCacheService).invalidate(key(session));
        await pool.query('DELETE FROM ai_chat_session WHERE id=ANY($1::uuid[])',[sessions]);
        await pool.query('DELETE FROM ai_chat_turns WHERE session_id=ANY($1::uuid[])',[sessions]);
        await pool.query('DELETE FROM ai_chat_messages WHERE session_id=ANY($1::uuid[])',[sessions]);
        await pool.query('DELETE FROM ai_chat_sessions WHERE id=ANY($1::uuid[])',[sessions]);
        await pool.query('DELETE FROM users WHERE email=ANY($1::text[])',[emails]);
      }
    } finally {await app?.close();}
  });

  it('两轮按顺序传入模型，历史可重新读取；相同请求编号不会重复调用', async ()=>{
    chat.mockClear();
    const session=await createSession();
    const url=`/ai-agent/sessions/${session}/turns`;
    const requestId=randomUUID();
    await request(app.getHttpServer()).post(url).send({requestId,text:'你好'}).expect(401);
    await request(app.getHttpServer()).post(url).auth(otherToken,{type:'bearer'}).send({requestId,text:'你好'}).expect(404);
    const first=await request(app.getHttpServer()).post(url).auth(token,{type:'bearer'}).send({requestId,text:'你好'}).expect(201);
    expect(first.body).toMatchObject({status:'completed',userMessage:{content:{text:'你好'}},assistantMessage:{content:{text:'模拟回复'}}});
    expect(chat.mock.calls[0][0]).toEqual([{role:'user',content:'你好'}]);
    const repeat=await request(app.getHttpServer()).post(url).auth(token,{type:'bearer'}).send({requestId,text:'你好'}).expect(201);
    expect(repeat.body.turnId).toEqual(first.body.turnId);
    expect(chat).toHaveBeenCalledTimes(1);
    expect(await app.get(AiCacheService).get(key(session))).toEqual([
      { turnId: first.body.turnId, user: '你好', assistant: '模拟回复' },
    ]);
    expect(await app.get(AiCacheService).get({ ...key(session), userId: otherUserId })).toBeUndefined();
    await request(app.getHttpServer()).post(url).auth(token,{type:'bearer'}).send({requestId,text:'不同内容'}).expect(409);
    await request(app.getHttpServer()).post(url).auth(token,{type:'bearer'}).send({requestId:randomUUID(),text:'继续'}).expect(201);
    expect(chat.mock.calls[1][0]).toEqual([{role:'user',content:'你好'},{role:'assistant',content:'模拟回复'},{role:'user',content:'继续'}]);
    const history=await request(app.getHttpServer()).get(`/ai-agent/sessions/${session}/messages`).auth(token,{type:'bearer'}).expect(200);
    expect(history.body.items.map((m:{role:string})=>m.role)).toEqual(['user','assistant','user','assistant']);
    expect(history.body.items[0].turnStatus).toBe('completed');
  });

  it('模型失败后保留用户消息和失败状态，不插入假回复', async ()=>{
    const session=await createSession();
    chat.mockRejectedValueOnce(new ModelError('authentication','private detail not returned'));
    const requestId = randomUUID();
    const result=await request(app.getHttpServer()).post(`/ai-agent/sessions/${session}/turns`)
      .auth(token,{type:'bearer'}).send({requestId,text:'测试失败'}).expect(502);
    expect(result.body).toMatchObject({status:'failed',errorCode:'authentication'});
    expect(JSON.stringify(result.body)).not.toContain('private detail');
    const history=await request(app.getHttpServer()).get(`/ai-agent/sessions/${session}/messages`).auth(token,{type:'bearer'}).expect(200);
    expect(history.body.items).toHaveLength(1);
    expect(history.body.items[0]).toMatchObject({role:'user',turnStatus:'failed',errorCode:'authentication'});
    expect(await app.get(AiCacheService).get(key(session))).toEqual([]);
    await request(app.getHttpServer()).post(`/ai-agent/sessions/${session}/turns`)
      .auth(token,{type:'bearer'}).send({requestId,text:'测试失败'}).expect(409);
    await request(app.getHttpServer()).post(`/ai-agent/sessions/${session}/turns`)
      .auth(token,{type:'bearer'}).send({requestId:randomUUID(),text:'重新提问'}).expect(201);
    expect(chat.mock.lastCall?.[0]).toEqual([{role:'user',content:'重新提问'}]);
  });

  it('旧的中断回合会在下次对话时标记失败；模型超时返回504', async ()=>{
    const session=await createSession();
    const user=await pool.query<{id:string}>("INSERT INTO ai_chat_messages(session_id,role,content) VALUES($1,'user',$2::jsonb) RETURNING id",[session,JSON.stringify({text:'中断前'})]);
    await pool.query("INSERT INTO ai_chat_turns(session_id,request_id,user_message_id,status) VALUES($1,$2,$3,'pending')",[session,randomUUID(),user.rows[0].id]);
    chat.mockRejectedValueOnce(new ModelError('timeout','internal timeout'));
    await request(app.getHttpServer()).post(`/ai-agent/sessions/${session}/turns`)
      .auth(token,{type:'bearer'}).send({requestId:randomUUID(),text:'超时测试'}).expect(504);
    const history=await request(app.getHttpServer()).get(`/ai-agent/sessions/${session}/messages`).auth(token,{type:'bearer'}).expect(200);
    expect(history.body.items).toHaveLength(2);
    expect(history.body.items[0]).toMatchObject({turnStatus:'failed',errorCode:'interrupted'});
    expect(history.body.items[1]).toMatchObject({turnStatus:'failed',errorCode:'timeout'});
  });

  it('同会话并发发送被拦截，不会生成重叠回复', async ()=>{
    const session=await createSession();
    const otherSession = await createSession();
    let entered!:()=>void;
    let release!:()=>void;
    const started=new Promise<void>(resolve=>{entered=resolve;});
    const gate=new Promise<void>(resolve=>{release=resolve;});
    chat.mockImplementationOnce(async()=>{entered();await gate;return reply;});
    const url=`/ai-agent/sessions/${session}/turns`;
    const first=request(app.getHttpServer()).post(url).auth(token,{type:'bearer'}).send({requestId:randomUUID(),text:'第一条'}).then(r=>r);
    await started;
    try {
      await request(app.getHttpServer()).post(`/ai-agent/sessions/${session.toUpperCase()}/turns`)
        .auth(token,{type:'bearer'}).send({requestId:randomUUID(),text:'第二条'}).expect(409);
      await request(app.getHttpServer()).patch(`/ai/sessions/${session.toUpperCase()}`)
        .auth(token, { type: 'bearer' }).send({ status: 'closed' }).expect(409);
      await send(otherSession, '独立会话');
      expect(chat.mock.lastCall?.[0]).toEqual([{ role: 'user', content: '独立会话' }]);
    } finally { release(); }
    expect((await first).status).toBe(201);
    await send(session, '第二条');
    expect(await app.get(AiCacheService).get(key(session))).toEqual([
      expect.objectContaining({ user: '第一条' }), expect.objectContaining({ user: '第二条' }),
    ]);
    expect(await app.get(AiCacheService).get(key(otherSession))).toEqual([expect.objectContaining({ user: '独立会话' })]);
  });

  it('上下文最多带最近10个完整回合', async ()=>{
    chat.mockClear();
    const session=await createSession();
    const url=`/ai-agent/sessions/${session}/turns`;
    for(let i=0;i<11;i++) {
      await request(app.getHttpServer()).post(url).auth(token,{type:'bearer'})
        .send({requestId:randomUUID(),text:`消息${i}`}).expect(201);
    }
    const context=chat.mock.lastCall?.[0] as {role:string;content:string}[];
    expect(context).toHaveLength(21);
    expect(context[0]).toEqual({role:'user',content:'消息0'});
    await request(app.getHttpServer()).post(url).auth(token,{type:'bearer'})
      .send({requestId:randomUUID(),text:'最后一条'}).expect(201);
    const bounded=chat.mock.lastCall?.[0] as {role:string;content:string}[];
    expect(bounded).toHaveLength(21);
    expect(bounded[0]).toEqual({role:'user',content:'消息1'});
    expect(bounded.at(-1)).toEqual({role:'user',content:'最后一条'});
    expect(await app.get(AiCacheService).get(key(session))).toEqual(
      [...Array.from({ length: 9 }, (_, i) => `消息${i + 2}`), '最后一条']
        .map(user => expect.objectContaining({ user, assistant: '模拟回复' })),
    );
  });

  it('命中时复用正文，Redis 真正过期后从 PostgreSQL 恢复已完成轮次', async () => {
    const session = await createSession();
    const cache = app.get(AiCacheService);
    await send(session, '第一问');
    const load = vi.spyOn(app.get(ChatTurnRepository), 'completedTurns');
    try {
      await send(session, '第二问');
      expect(load).not.toHaveBeenCalled();
      const snapshot = await cache.get(key(session));
      expect(snapshot).toBeDefined();
      await cache.set(key(session), snapshot!, 1);
      await vi.waitFor(async () => expect(await cache.get(key(session))).toBeUndefined(), { timeout: 3000 });
      await send(session, '第三问');
      expect(load).toHaveBeenCalledTimes(1);
      expect(chat.mock.lastCall?.[0]).toEqual([
        { role: 'user', content: '第一问' }, { role: 'assistant', content: '模拟回复' },
        { role: 'user', content: '第二问' }, { role: 'assistant', content: '模拟回复' },
        { role: 'user', content: '第三问' },
      ]);
      expect(await cache.get(key(session))).toHaveLength(3);
    } finally { load.mockRestore(); }
  });

  it('缓存断线不影响对话提交，恢复后的旧快照按数据库回合 ID 修复', async () => {
    const session = await createSession();
    const cache = app.get(AiCacheService);
    await send(session, '在线');
    const old = await cache.get(key(session));
    const offline = new ServiceUnavailableException();
    const read = vi.spyOn(cache, 'get').mockRejectedValue(offline);
    const write = vi.spyOn(cache, 'set').mockRejectedValue(offline);
    try {
      await send(session, '断线时');
      expect(chat.mock.lastCall?.[0]).toContainEqual({ role: 'user', content: '在线' });
    } finally { read.mockRestore(); write.mockRestore(); }
    expect(await cache.get(key(session))).toEqual(old);
    await send(session, '恢复后');
    expect(chat.mock.lastCall?.[0]).toContainEqual({ role: 'user', content: '断线时' });
    expect(await cache.get(key(session))).toHaveLength(3);
  });

  it('缓存和回源沿用模型字符预算，单独保存的用户消息不算一轮', async () => {
    const session = await createSession();
    await request(app.getHttpServer()).post(`/ai-agent/sessions/${session}/messages`)
      .auth(token, { type: 'bearer' }).send({ text: '单条消息' }).expect(201);
    chat.mockResolvedValueOnce({ ...reply, text: '长'.repeat(16001) });
    await send(session, '长回复');
    expect(chat.mock.lastCall?.[0]).toEqual([{ role: 'user', content: '长回复' }]);
    await send(session, '下一问');
    expect(chat.mock.lastCall?.[0]).toEqual([{ role: 'user', content: '下一问' }]);
    await app.get(AiCacheService).invalidate(key(session));
    await send(session, '再问');
    expect(chat.mock.lastCall?.[0]).toEqual([
      { role: 'user', content: '下一问' }, { role: 'assistant', content: '模拟回复' },
      { role: 'user', content: '再问' },
    ]);
  });

  it('关闭主动清理，旧聊天入口在关闭期间只读写数据库，重开后恢复；软删除清理缓存', async () => {
    const session = await createSession();
    const cache = app.get(AiCacheService);
    const path = `/ai/sessions/${session}`;
    await send(session, '关闭前');
    await request(app.getHttpServer()).patch(path).auth(otherToken, { type: 'bearer' }).send({ status: 'closed' }).expect(404);
    expect(await cache.get(key(session))).toHaveLength(1);
    await request(app.getHttpServer()).patch(path).auth(token, { type: 'bearer' }).send({ status: 'closed' }).expect(200);
    expect(await cache.get(key(session))).toBeUndefined();
    await send(session, '关闭期间');
    expect(await cache.get(key(session))).toBeUndefined();
    await request(app.getHttpServer()).patch(path).auth(token, { type: 'bearer' }).send({ status: 'active' }).expect(200);
    await send(session, '重新打开');
    expect(await cache.get(key(session))).toHaveLength(3);
    await request(app.getHttpServer()).delete(path).auth(token, { type: 'bearer' }).expect(200);
    expect(await cache.get(key(session))).toBeUndefined();
    await request(app.getHttpServer()).post(`/ai-agent/sessions/${session}/turns`)
      .auth(token, { type: 'bearer' }).send({requestId: randomUUID(), text: '已删除'}).expect(404);
  });

  it('服务重启后可重新读取已保存的对话', async ()=>{
    const session=await createSession();
    await request(app.getHttpServer()).post(`/ai-agent/sessions/${session}/turns`).auth(token,{type:'bearer'})
      .send({requestId:randomUUID(),text:'重启前消息'}).expect(201);
    await app.close();
    const module=await Test.createTestingModule({imports:[AppModule]})
      .overrideProvider(ModelService).useValue({chat}).compile();
    app=module.createNestApplication();
    setupApp(app);
    await app.init();
    pool=app.get(PG_POOL);
    const history=await request(app.getHttpServer()).get(`/ai-agent/sessions/${session}/messages`).auth(token,{type:'bearer'}).expect(200);
    expect(history.body.items.map((m:{content:{text:string}})=>m.content.text)).toEqual(['重启前消息','模拟回复']);
  });
});
