#!/bin/bash
# SessionStart hook for Claude Code on the web: make `npm test`, `npm run
# lint`, and `npm run dev` work immediately. The Vitest suite runs against
# a REAL Postgres (vitest.config.ts / HANDOFF.md), so this provisions a
# local server plus the dev/test databases, synthesizes .env/.env.test with
# generated secrets (dummy Google creds — no real login in web sessions),
# and migrates + seeds both databases. Idempotent; local-only state.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

echo "[session-start] npm install..."
npm install --no-audit --no-fund

# --- PostgreSQL ------------------------------------------------------------
if ! command -v psql >/dev/null 2>&1; then
  echo "[session-start] installing postgresql..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq && apt-get install -y -qq postgresql >/dev/null
fi

if ! pg_isready -q -h localhost 2>/dev/null; then
  echo "[session-start] starting postgresql..."
  service postgresql start || pg_ctlcluster "$(ls /etc/postgresql | head -1)" main start
  for _ in $(seq 1 15); do pg_isready -q -h localhost 2>/dev/null && break; sleep 1; done
fi

# Role + databases (idempotent).
su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='rewaa'\"" | grep -q 1 ||
  su postgres -c "psql -c \"CREATE USER rewaa WITH SUPERUSER PASSWORD 'rewaa'\""
for db in rewaa_academy_dev rewaa_academy_test; do
  su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='$db'\"" | grep -q 1 ||
    su postgres -c "psql -c \"CREATE DATABASE $db OWNER rewaa\""
done

# --- Env files -------------------------------------------------------------
write_env() { # $1 = file, $2 = database name
  [ -f "$1" ] && return 0
  echo "[session-start] writing $1..."
  local secret ed_key
  secret=$(node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))")
  ed_key=$(node -e "const {generateKeyPairSync}=require('node:crypto');const {privateKey}=generateKeyPairSync('ed25519');process.stdout.write(privateKey.export({type:'pkcs8',format:'pem'}).replace(/\n/g,'\\\\n'))")
  cat > "$1" <<ENV
DATABASE_URL="postgresql://rewaa:rewaa@localhost:5432/$2?schema=public"
AUTH_SECRET="$secret"
AUTH_GOOGLE_ID="web-session-dummy.apps.googleusercontent.com"
AUTH_GOOGLE_SECRET="web-session-dummy"
ALLOWED_GOOGLE_WORKSPACE_DOMAIN="example.com"
ANTHROPIC_API_KEY=""
ANTHROPIC_MODEL="claude-sonnet-5"
CERTIFICATE_SIGNING_PRIVATE_KEY="$ed_key"
ENV
}
write_env .env rewaa_academy_dev
write_env .env.test rewaa_academy_test

# --- Prisma: generate, migrate, seed (both DBs; seed is upsert-idempotent) -
# DATABASE_URL is passed explicitly: `tsx prisma/seed.ts` does NOT load .env
# (only the `prisma db seed` wrapper does, via prisma.config.ts).
DEV_URL="postgresql://rewaa:rewaa@localhost:5432/rewaa_academy_dev?schema=public"
TEST_URL="postgresql://rewaa:rewaa@localhost:5432/rewaa_academy_test?schema=public"
echo "[session-start] prisma generate + migrate + seed..."
npx prisma generate
DATABASE_URL="$DEV_URL" npx prisma migrate deploy
DATABASE_URL="$DEV_URL" npx tsx prisma/seed.ts
DATABASE_URL="$TEST_URL" npx prisma migrate deploy
DATABASE_URL="$TEST_URL" npx tsx prisma/seed.ts

echo "[session-start] ready: npm test / npm run lint / npm run dev"
