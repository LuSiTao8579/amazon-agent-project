// 本地数据库迁移工具：按文件名顺序执行 migrations/*.sql，每个文件只执行一次。
// 用法：npm run db:migrate          执行尚未执行的迁移
//       npm run db:migrate -- --status  只查看状态，不修改数据库
// 已初始化的 PostgreSQL 不会重新执行 docker/postgres/init.sql，所以建表走这里，
// 不需要、也不应该为了建表删除 Docker 数据卷。
import { config } from 'dotenv';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
const url = process.env.DATABASE_URL;
if (!url) throw new Error('Missing DATABASE_URL in bknd/.env');

const dir = fileURLToPath(new URL('../migrations/', import.meta.url));
const files = (await readdir(dir)).filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f)).sort();
const statusOnly = process.argv.includes('--status');

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  // 防止两个终端同时迁移。
  await client.query('SELECT pg_advisory_lock(hashtext($1))', ['bknd-migrations']);
  const exists = (await client.query("SELECT to_regclass('schema_migrations') AS t")).rows[0].t;
  if (!exists && !statusOnly)
    await client.query(`CREATE TABLE schema_migrations (
      version    text        PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
  const { rows } = exists || !statusOnly
    ? await client.query('SELECT version FROM schema_migrations')
    : { rows: [] };
  const applied = new Set(rows.map((r) => r.version));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`✓ ${file}（已执行）`);
      continue;
    }
    if (statusOnly) {
      console.log(`… ${file}（待执行）`);
      continue;
    }
    const sql = await readFile(dir + file, 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`+ ${file}（本次执行）`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`✗ ${file} 执行失败，已回滚`);
      throw error;
    }
  }
} finally {
  await client.end();
}
