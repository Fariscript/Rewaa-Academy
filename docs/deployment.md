# Deployment proposal — needs owner sign-off

Status: **proposal only, nothing provisioned.** Prepared so the go-live
decision is a choice between two concrete options rather than a research
task. Covers the deployment-shaped NFRs that are code-complete but
infrastructure-dependent: NFR-03 (TLS), NFR-14 (uptime), NFR-15 (backups),
plus secret handling.

## Runtime facts that constrain any choice

- **Node runtime required** (not edge): certificate PDFs use pdf-lib +
  fontkit + bundled `.ttf` files read from `node_modules` at runtime.
- **PostgreSQL** with a driver-adapter connection (`@prisma/adapter-pg`,
  plain `pg` pool). Database sessions (NextAuth) mean session revocation
  and the forge-a-session trick in `npm run smoke` both depend on DB
  access — sessions are rows, not JWTs.
- **No background workers to host.** Everything time-dependent is computed
  lazily on read (deliberate pattern) — no cron, no queue, nothing extra
  to deploy or monitor.
- Outbound calls: Google OAuth endpoints; Anthropic API once slice 5b's
  key exists. Nothing else.
- Traffic profile: internal tool, one company's sales team — tens of
  concurrent users, not thousands (see scripts/perf-sanity.ts numbers).

## Option A — Vercel + managed Postgres (Neon / Supabase / RDS)

The default for a Next.js app this size.

- NFR-03: TLS automatic (both app and DB connections).
- NFR-14: platform SLAs comfortably cover "high uptime during business
  hours"; zero servers to patch.
- NFR-15: managed automated daily backups + point-in-time recovery from
  the DB provider; the restore runbook is the provider's console flow.
- Migrations: `prisma migrate deploy` as a release step.
- Watch out: serverless function timeouts are irrelevant at current
  latencies (~150ms worst hot path) but PDF generation should stay on the
  Node runtime, not edge. Connection pooling: use the provider's pooler
  (e.g. Neon pooled connection string) since serverless multiplies
  connections.

## Option B — self-hosted VM/container (data-residency route)

If company policy requires data inside Saudi Arabia (**ask before
choosing A** — this is the deciding question), run the standalone Next.js
server + Postgres on a KSA-region VM (e.g. a local cloud provider or
on-prem).

- NFR-03: TLS via a reverse proxy (Caddy auto-TLS is the least-effort).
- NFR-14: single VM is fine for business-hours uptime; add a second app
  instance only if it ever matters.
- NFR-15: nightly `pg_dump` to object storage + weekly restore drill;
  a written runbook is REQUIRED here (unlike option A it isn't a console
  button).
- Cost: more ops ownership — patching, monitoring, disk space.

## Either way

- **Secrets**: `AUTH_SECRET`, Google OAuth creds,
  `CERTIFICATE_SIGNING_PRIVATE_KEY` (Ed25519), later `ANTHROPIC_API_KEY`
  — platform secret manager, never in the repo. **The Ed25519 key is
  special:** losing it breaks public verification of every issued
  certificate (NFR-18 signatures can no longer be re-derived — the verify
  endpoint checks against the current key). Back it up separately and
  never rotate it casually; if rotation is ever needed, keep the old
  public key servable for previously-issued certificates.
- **Google OAuth**: add the production callback URL
  (`https://<domain>/api/auth/callback/google`) to the Workspace OAuth
  client; keep the domain restriction (`ALLOWED_GOOGLE_WORKSPACE_DOMAIN`)
  pointing at the real company domain.
- **Launch gate reminder (not infra):** open item #3b (sequential lesson
  ordering) should be answered by the CEO before trainees get access —
  CLAUDE.md flags retrofitting order-enforcement as expensive.

## Recommendation

Option A unless data residency says otherwise. Decision needed from the
owner: (1) A or B, (2) DB provider/region, (3) production domain.
