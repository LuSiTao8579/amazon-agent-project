#!/usr/bin/env bash
# 在两个临时容器上验收生产构建，数据库地址与 JWT 仅在本次运行中有效。
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build
npm --prefix ../ftnd run build

postgres=''
redis=''
cleanup() {
  if [[ -n "$redis" ]]; then docker rm -fv "$redis" >/dev/null; fi
  if [[ -n "$postgres" ]]; then docker rm -fv "$postgres" >/dev/null; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

POSTGRES_PASSWORD=$(node -p "require('node:crypto').randomBytes(32).toString('hex')")
JWT_SECRET=$(node -p "require('node:crypto').randomBytes(32).toString('hex')")
export POSTGRES_PASSWORD JWT_SECRET
postgres=$(docker run -d -p 127.0.0.1::5432 -e POSTGRES_USER=app -e POSTGRES_PASSWORD -e POSTGRES_DB=ai_tools_acceptance pgvector/pgvector:pg17)
redis=$(docker run -d -p 127.0.0.1::6379 redis:7-alpine)
for ((i=0; i<60; i++)); do
  if docker exec "$postgres" pg_isready -qh 127.0.0.1 -U app -d ai_tools_acceptance && [[ $(docker exec "$redis" redis-cli ping) == PONG ]]; then break; fi
  sleep 1
done
docker exec "$postgres" pg_isready -h 127.0.0.1 -U app -d ai_tools_acceptance
[[ $(docker exec "$redis" redis-cli ping) == PONG ]]

pg_addr=$(docker port "$postgres" 5432/tcp)
redis_addr=$(docker port "$redis" 6379/tcp)
export DATABASE_URL="postgres://app:$POSTGRES_PASSWORD@$pg_addr/ai_tools_acceptance" REDIS_URL="redis://$redis_addr/0"
npm run db:migrate
node scripts/verify-ai-tools-browser.mjs
