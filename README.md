# Rewaa Sales Academy — Testing & Assessment Engine

Sector-based sales training platform (internal, Arabic-only UI): trainees
complete lessons, take quizzes gated at **95% passing** with a **2-attempt
cap**, and earn a digitally-signed certificate once every quiz in their
sector is passed. Admins manage the question bank (AI drafts require human
approval), grade free-text answers, and use a deliberately basic dashboard.

**Read these before changing anything:**

| Doc | What it is |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Build rules, non-negotiables, and the open business decisions — the always-loaded source of truth |
| [`HANDOFF.md`](HANDOFF.md) | Current status snapshot for anyone picking the project up |
| [`docs/fr-to-code.md`](docs/fr-to-code.md) | Requirement-by-requirement traceability (ID → files → tests → status) |

## Stack

Next.js (App Router, TypeScript) · PostgreSQL via Prisma (`@prisma/adapter-pg`) ·
NextAuth v5 (Google Workspace SSO, domain-restricted, database sessions) ·
Tailwind v4 · Vitest (runs against a real Postgres) · pdf-lib (Arabic
certificate PDFs).

## Local setup

Prerequisites: Node 22+, PostgreSQL 16+.

```bash
npm ci

# 1. Environment — copy the example twice and fill in real local values
#    (.env.example documents how to generate AUTH_SECRET and the Ed25519
#    certificate signing key; Google OAuth creds are only needed for real
#    login flows).
cp .env.example .env        # DATABASE_URL → your dev database
cp .env.example .env.test   # DATABASE_URL → a SEPARATE test database

# 2. Databases — create both, then migrate + seed each
createdb rewaa_academy_dev
createdb rewaa_academy_test
npx prisma migrate deploy && npm run db:seed                      # dev (from .env)
DATABASE_URL=<test-db-url> npx prisma migrate deploy
DATABASE_URL=<test-db-url> npx tsx prisma/seed.ts                 # test

# 3. Verify
npm test        # full suite — needs the live, seeded TEST database
npm run dev     # http://localhost:3000
```

The seed creates two fixture users (`trainee@example.com`, `admin@example.com`),
a 3-sector taxonomy stub, and immediately-usable APPROVED questions.

## Checks

| Command | What it does |
|---|---|
| `npm test` | Vitest against the seeded test DB (sequential by design — one shared DB) |
| `npm run lint` / `npx tsc --noEmit` | Lint and typecheck (both enforced in CI) |
| `npm run smoke` | End-to-end smoke against a running `npm run dev` + seeded **dev** DB: full quiz flow with countdown/resume/expiry, answer-key redaction audit, certificate issue/PDF/verify, grading queue. Forges DB session rows for the fixture users and resets the fixture trainee's progress — dev DB only. Set `SMOKE_CHROMIUM=/path/to/chromium` to include the browser stages. Not part of CI. |

CI (`.github/workflows/ci.yml`) runs lint → typecheck → tests → build against
a Postgres service container on every push.

`scripts/verify-ai-drafter.ts` is a separate manual verification for the AI
question drafter — it needs a real `ANTHROPIC_API_KEY` and is deliberately not
run by tests or CI (see the Blocked section in `CLAUDE.md`).
