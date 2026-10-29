import { config } from 'dotenv';
import pg from 'pg';
import { hash } from 'argon2';
import { randomUUID } from 'node:crypto';
config({path:new URL('../.env',import.meta.url),quiet:true});
const db=new pg.Client({connectionString:process.env.DATABASE_URL});
await db.connect();
try {
  await db.query('BEGIN');
  // 演示账号不可登录：停用状态、随机密码；重复执行不会覆盖已有账号。
  for(const [i,role] of ['Member','Manager','Analyst'].entries()) {
    await db.query('INSERT INTO users(email,password_hash,name,role,status) VALUES($1,$2,$3,$4,$5) ON CONFLICT(email) DO NOTHING',
      [`demo-${i}@example.test`,await hash(randomUUID()),`演示用户 ${i+1}`,role,'inactive']);
  }
  await db.query('COMMIT');
  console.log('演示用户准备完成');
} catch(e) {await db.query('ROLLBACK');throw e;}
finally {await db.end();}
