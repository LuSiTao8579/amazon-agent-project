#!/usr/bin/env bash
# 从仓库内任意目录使用 bash 调用。测试连接和容器均由本脚本创建。
set -euo pipefail
cd "$(dirname "$0")/.."
work=$(mktemp -d)
postgres=''
redis=''
cleanup() {
  if [[ -n "$redis" ]]; then docker rm -fv "$redis" >/dev/null; fi
  if [[ -n "$postgres" ]]; then docker rm -fv "$postgres" >/dev/null; fi
  rm -rf -- "$work"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

npm run build
npm run lint
npm exec -- tsc --noEmit --incremental false

POSTGRES_PASSWORD=$(node -p "require('node:crypto').randomBytes(32).toString('hex')")
JWT_SECRET=$(node -p "require('node:crypto').randomBytes(32).toString('hex')")
export POSTGRES_PASSWORD JWT_SECRET
postgres=$(docker run -d -p 127.0.0.1::5432 -e POSTGRES_USER=app -e POSTGRES_PASSWORD -e POSTGRES_DB=week1_fresh pgvector/pgvector:pg17)
redis=$(docker run -d -p 127.0.0.1::6379 redis:7-alpine)
for ((i=0; i<60; i++)); do
  if docker exec "$postgres" pg_isready -q -h 127.0.0.1 -U app -d week1_fresh && [[ $(docker exec "$redis" redis-cli ping) == PONG ]]; then break; fi
  sleep 1
done
docker exec "$postgres" pg_isready -h 127.0.0.1 -U app -d week1_fresh
[[ $(docker exec "$redis" redis-cli ping) == PONG ]]
pg_addr=$(docker port "$postgres" 5432/tcp)
redis_addr=$(docker port "$redis" 6379/tcp)
pg_url="postgres://app:$POSTGRES_PASSWORD@$pg_addr"
export REDIS_URL="redis://$redis_addr/0"

# 先用原迁移工具建立 0006 旧库，在添加 0007 前写入已有账号、会话与一轮对话。
docker exec "$postgres" createdb -U app week1_upgrade
export DATABASE_URL="$pg_url/week1_upgrade"
mkdir -p "$work/scripts" "$work/migrations"
cp scripts/migrate.mjs "$work/scripts/"
cp migrations/000[1-6]_*.sql "$work/migrations/"
ln -s "$PWD/node_modules" "$work/node_modules"
node "$work/scripts/migrate.mjs"
old_db() { docker exec -i "$postgres" psql -XqAt -v ON_ERROR_STOP=1 -U app -d week1_upgrade "$@"; }
LEGACY_PASSWORD=$(node -p "require('node:crypto').randomBytes(24).toString('hex')")
export LEGACY_PASSWORD
legacy_hash=$(node --input-type=module -e "import { PasswordHasher } from './dist/users/password-hasher.service.js'; process.stdout.write(await new PasswordHasher().hash(process.env.LEGACY_PASSWORD))")
old_db -v "fixture_hash=$legacy_hash" <<'SQL'
WITH owner AS (
  INSERT INTO users(email,password_hash) VALUES ('legacy@example.test',:'fixture_hash') RETURNING id
), session AS (
  INSERT INTO ai_chat_sessions(user_id,title) SELECT id,'旧会话' FROM owner RETURNING id
), question AS (
  INSERT INTO ai_chat_messages(session_id,role,content) SELECT id,'user','{"text":"旧问题"}' FROM session RETURNING id,session_id
), answer AS (
  INSERT INTO ai_chat_messages(session_id,role,content) SELECT session_id,'assistant','{"text":"旧回复"}' FROM question RETURNING id
)
INSERT INTO ai_chat_turns(session_id,request_id,user_message_id,assistant_message_id,status)
SELECT question.session_id,gen_random_uuid(),question.id,answer.id,'completed' FROM question,answer;
SQL
list_tables() { old_db -c "SELECT tablename FROM pg_tables WHERE schemaname='public'" | LC_ALL=C sort; }
list_tables > "$work/old-tables"
table_args=()
while IFS= read -r table; do
  if [[ $table != schema_migrations ]]; then table_args+=(-t "public.$table"); fi
done < "$work/old-tables"
# 相同的 restrict key 避免 pg_dump 在两次输出中插入不同的随机标记。
dump_key=$(node -p "require('node:crypto').randomBytes(24).toString('hex')")
snapshot() { docker exec "$postgres" pg_dump -U app -d week1_upgrade --strict-names --restrict-key="$dump_key" "${table_args[@]}"; }
snapshot > "$work/before.sql"
# 按真实升级顺序先写入一条 0007 审计，再检查 0008 对历史行的兼容。
cp migrations/0007_ai_foundation.sql "$work/migrations/"
node "$work/scripts/migrate.mjs"
old_db -c "INSERT INTO ai_operation_audit(user_id,action,resource_type,result)
  SELECT id,'legacy.read','legacy','success' FROM users WHERE email='legacy@example.test'"
npm run db:migrate
[[ $(old_db -c "SELECT count(*) FROM ai_operation_audit WHERE action='legacy.read'
  AND tool_name IS NULL AND input_params IS NULL AND result_summary IS NULL AND ip IS NULL") == 1 ]]
snapshot > "$work/after.sql"
diff -u "$work/before.sql" "$work/after.sql"
{ cat "$work/old-tables"; printf '%s\n' ai_chat_session ai_operation_audit ai_task_record ai_user_memory; } | LC_ALL=C sort > "$work/expected-tables"
list_tables > "$work/actual-tables"
diff -u "$work/expected-tables" "$work/actual-tables"
history() { old_db -c 'SELECT version,applied_at FROM schema_migrations ORDER BY version'; }
history > "$work/applied"
npm run db:migrate
history > "$work/repeated"
diff -u "$work/applied" "$work/repeated"
old_db <<'SQL'
DO $$ BEGIN
  TRUNCATE ai_operation_audit;
  RAISE EXCEPTION '审计表允许 TRUNCATE';
EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
END $$;
SQL
echo '0007 旧库升级通过：仅新增四表，旧业务表定义和历史数据一致，迁移重跑无变化。'

# 用编译产物和项目实际 provider 验证升级路径，包括已提交的审计写入和回读。
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { AppModule } from './dist/app.module.js';
import { setupApp } from './dist/setup-app.js';
import { verifyToolAudits } from './scripts/verify-ai-tool-audits.mjs';
import { verifyAiStorage } from './scripts/verify-ai-storage.mjs';

const app = await NestFactory.create(AppModule, { logger: false });
try {
  setupApp(app);
  await app.init();
  const http = request(app.getHttpServer());
  const login = await http.post('/auth/login').send({ email: 'legacy@example.test', password: process.env.LEGACY_PASSWORD }).expect(200);
  const bearer = { Authorization: 'Bearer ' + login.body.accessToken };
  const sessions = await http.get('/ai/sessions').set(bearer).expect(200);
  assert.equal(sessions.body.items.length, 1);
  const session = sessions.body.items[0];
  assert.equal(session.title, '旧会话');
  assert.equal(session.status, 'active');
  const messages = await http.get('/ai-agent/sessions/' + session.id + '/messages').set(bearer).expect(200);
  assert.deepEqual(messages.body.items.map(message => message.content.text), ['旧问题', '旧回复']);
  const audits = await http.get('/ai/audits').set(bearer).expect(200);
  assert.equal(audits.body.items.length, 1);
  const oldAudit = await http.get('/ai/audits/' + audits.body.items[0].id).set(bearer).expect(200);
  assert.equal(oldAudit.body.action, 'legacy.read');
  assert.equal(oldAudit.body.userId, session.userId);
  assert.equal(oldAudit.body.result, 'success');
  for (const field of ['toolName', 'inputParams', 'resultSummary', 'ip']) {
    assert.equal(oldAudit.body[field], null);
  }
  const report = await http.post('/ai/audits').set(bearer).send({
    action: 'session.read', resourceType: 'session', resourceId: session.id, result: 'success',
  }).expect(201);
  const saved = await http.get('/ai/audits/' + report.body.id).set(bearer).expect(200);
  assert.equal(saved.body.action, 'client.session.read');
  assert.equal(saved.body.resourceId, session.id);
  assert.equal(saved.body.userId, session.userId);
  await verifyAiStorage(app, http, bearer);
  await verifyToolAudits(app, http, bearer);
} finally {
  await app.close();
}
JS
echo '0008 升级后 HTTP 验证通过：旧账号、会话、消息和 0007 审计均可读取；新审计可写入并按 ID 回读。'

export DATABASE_URL="$pg_url/week1_fresh"
npm run db:migrate
npm run db:migrate -- --status
npm test
npm run test:e2e -- --no-file-parallelism
llm_keys=$(docker exec "$redis" redis-cli --scan --pattern 'ai:llm_cache:*')
[[ -z "$llm_keys" ]] || { echo '验收失败：出现了模型调用缓存 Key' >&2; exit 1; }
echo '全量回归通过，独立 Redis 中的模型调用缓存 Key 数为 0。'
