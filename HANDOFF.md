# Handoff — Rewaa Sales Academy (Testing & Assessment Engine)

Last updated: 2026-07-20 (second update, after the slice 9–15 UI/completion
run; the original snapshot below it is kept as-is where still accurate).

## Update 2026-07-20: slices 9–15 — the UI/API completion run

The original snapshot below said "Phase 1 essentially complete"; that was
true of the lib/API layer only — the product had no UI beyond login and a
placeholder home. A second build run closed that:

- **Slice 9** — trainee attempt read view (`GET /api/attempts/[id]`,
  ownership-checked before `syncExpiry`, answer key redacted
  unconditionally) + the NFR-13 named regression test. Also **fixed a live
  answer-key leak**: the PATCH-answers and POST-submit responses used to
  serialize raw `AttemptAnswer` rows including `correctOption` — mid-attempt
  in the PATCH case. All trainee-facing attempt reads now pass through
  `toTraineeAttemptView` (`src/lib/quiz/attempt-view.ts`).
- **Slice 10** — admin quiz catalog (`GET /api/admin/quizzes`) + the
  roles-table "Admin can override attempts" capability:
  `AttemptCapOverride` grants (+1 each, reason required, audited), default
  cap of 2 immutable, honored by start-attempt/outcome/dashboard.
  Deliberately does not decide open item #1.
- **CI** — `.github/workflows/ci.yml`: postgres:16 service container,
  lint + tsc + the full Vitest suite (migrated + seeded) + `next build`.
- **Slices 11–13** — full trainee UI (Arabic RTL, mobile-first, plain
  Tailwind, first client components): home sector tree, lesson page with
  the literal Start button (T-33), quiz runner with the visible
  server-authoritative countdown/autosave/resume (T-32 now Done), result
  page, certificate page (lazy issuance on visit). Also **fixed a real
  certificate-PDF bug**: Latin SSO names and Western date digits rendered
  as tofu boxes (drawn with the Arabic-only font) — now split into script
  runs per font, verified pixel-level.
- **Slices 14–15** — admin UI: shell + role redirects, quiz index,
  per-quiz dashboard (tiles + trainee table + grant-attempt control),
  trainees/sector assignment, grading queue with an isolated binary
  grade-input (so a partial-credit answer to open item #4 changes one
  component + `gradeAnswer`).
- **Owner decisions recorded 2026-07-20:** FR-18 taxonomy CUD and T-36
  content-level versioning are **deferred to Ibrahim's content system**;
  this engine keeps its read-only taxonomy mirror.
- **Still exactly as blocked as before:** slice 5b live verification
  (needs `ANTHROPIC_API_KEY`), T-26 finalization (open item #4), and the
  question-bank UI (held behind 5b per the no-stacking rule). Phase 2
  remains embargoed until 5b + T-26 close. **Open item #3b is now a launch
  gate:** the trainee UI exists, so confirm sequential-ordering with the
  CEO before real trainees get access.
- Remember to tell Ibrahim's content team about open item #7 (95% is only
  reachable at question counts where it lands on a whole number).
- **Post-build adversarial review (multi-agent, findings verified) led to
  a fixes pass:** (1) per-question isCorrect/feedback are now hidden until
  the quiz OUTCOME is final (passed or attempts exhausted) — showing them
  on a failed attempt 1 would let a trainee reconstruct the answer key for
  attempt 2 (exact for TRUE_FALSE); (2) the quiz runner's pre-submit flush
  was dead code (submittedRef set before persist), silently dropping
  answers changed inside the autosave debounce window — submit now flushes
  first and refuses to finalize unsaved answers; autosaves are serialized
  through one promise chain and failures actually retry; (3) two
  react-hooks lint errors that made CI red; (4) certificate PDF no longer
  crashes on names outside WinAnsi (sanitized instead); (5) CI got a
  concurrency group and push-only triggers; a11y fieldset/legend on quiz
  options. Known-and-accepted (documented, not fixed): the route-boundary
  redaction test exercises the lib mapper rather than invoking the Next
  route handlers; the API permits starting attempt 2 while attempt 1 is
  PENDING_MANUAL_GRADE (cap still enforced; UI doesn't offer it);
  sector-select shows the old value while its PATCH is in flight.

Everything below is the original snapshot.

---

This file is a snapshot for coworkers (and their AI agents) picking up this
repo. It does not replace the two living source-of-truth docs — read those
first, this just orients you:

- **`CLAUDE.md`** — the requirements/build-rules doc. Always-loaded context
  for any AI agent working in this repo. Contains the non-negotiable rules,
  role model, build order, and — importantly — a list of **open business
  decisions the CEO hasn't made yet**. If your agent's task touches one of
  those, it should stop and ask, not guess. Read this in full before
  changing anything.
- **`docs/fr-to-code.md`** — requirement-by-requirement traceability table
  (FR-##/T-##/NFR-## → files → tests → status). This is the actual state of
  what's built vs. stubbed vs. not started. More reliable than this file for
  "is X done" — this file will drift, that table is meant to stay current.

## What this project is

Sector-based sales training platform for a single company (internal tool,
not multi-tenant). Trainees complete lessons, take quizzes gated at 95%
passing with a 2-attempt cap, and earn a digitally-signed certificate once
all required quizzes in their sector are passed. Admins manage the
question bank (including AI-drafted questions, which require human
approval before they can reach a trainee), grade free-text/scenario
answers manually, and use a basic dashboard.

Owner: Faris Alghamdi (this testing/quizzing engine). Content authoring
(the actual lesson/video content itself) is a separate track owned by
Ibrahim — don't build content-authoring UI beyond what CLAUDE.md lists as
a dependency stub.

## Stack

Next.js (TypeScript, App Router) + PostgreSQL via Prisma (driver adapter,
`@prisma/adapter-pg`) + NextAuth v5 (Google Workspace OAuth, domain-
restricted, database session strategy) + Vitest for tests.

Local dev DB: Postgres.app, trust auth, `rewaa_academy_dev`. See
`.env.example` for every required env var (all placeholders, no real
values — copy to `.env` and `.env.test` and fill in locally).

## Current status: Phase 1 essentially complete

All of Phase 1's 8 slices have shipped (see commit history below), with
two explicit exceptions left in a deliberately incomplete but
well-marked state — not bugs, not forgotten:

1. **Slice 5b (AI-draft generation) — held, not fully closed.** Code and
   tests are done and the *failure path* has been verified against the
   real Anthropic API (an invalid key produced a genuine 401, correctly
   caught and normalized). The *success path* — real question generation,
   real JSON parsing, real validation against genuine model output — is
   still unverified because a real `ANTHROPIC_API_KEY` hasn't been
   available yet. Verification script is ready to run the moment a key
   exists: see `CLAUDE.md`'s "Blocked" section for the exact command
   (`scripts/verify-ai-drafter.ts`, not run by CI, writes real rows to the
   dev DB). **Don't start any further question-bank work stacked on top
   of this until it's verified.**

2. **T-26 (manual-grading finalization) — blocked on a CEO decision.**
   Per-item grading (T-25) is fully built and tested: an Admin can grade
   a scenario/free-text/mock-call answer with a correct/incorrect
   judgment and written feedback. What's *not* built is the rule that
   converts a fully-graded attempt into an overall pass/fail score — an
   attempt with a manually-graded answer just sits at
   `PENDING_MANUAL_GRADE` forever right now. This is open item #4 in
   CLAUDE.md, reframed after investigation into a sharper question than
   the original doc posed: **does manual grading need partial-credit
   capability, or is a plain per-response correct/incorrect enough?**
   (The system currently only supports the latter.) That question has
   been sent to the CEO and is awaiting an answer. `TODO(open-item-4)`
   marks the exact plug-in points in `src/lib/grading/grading.ts` and
   `src/lib/quiz/attempt-lifecycle.ts`.

**Do not start Phase 2 work** (voice quiz, AI voice-call training, AI
video grader, AI customer-simulation roleplay, deeper dashboard
analytics) until both of the above are resolved — that's an explicit
instruction from the project owner, not a technical blocker.

## Commit history (chronological)

```
1954728 Slice 1: Google Workspace SSO + role model (FR-02, FR-03, T-27)
62a5af6 Slice 2: sector-scoped content model (FR-05, FR-06, FR-07, FR-08, FR-13, FR-14)
9550b3a Fix flaky exact-set assertion in list-users.test.ts (slice 2 fix)
eec9719 Slice 3: lesson-complete -> quiz-unlock trigger (T-1, T-7, T-8, T-9, T-33)
0b06c5d Slice 4: quiz engine (T-1, T-2, T-3, T-5, T-16, T-17, T-19, T-20, T-27, T-32)
c2c345e Fix intermittent cross-file test race (found during role-collapse verification)
85a6243 Collapse Role enum to Trainee/Admin — remove unused Trainer/Training Manager
34984f3 Slice 5a+5b: question status/versioning schema + AI-draft generation (5b held incomplete)
8bab81e Slice 5c: question approval hard gate (T-11, T-12 partial, NFR-05)
faac0a8 Slice 5d: manual question add/edit/retire + versioning (T-13, T-15)
d4a1131 Slice 5e: wire quiz assembly to approved-only bank (T-12, T-16)
97aef87 Slice 6: manual grading flow (T-6, T-18, T-25) - T-26 blocked on open item #4
62e2493 Slice 7: Admin quiz dashboard (T-21, T-22, T-23)
ae74b7f Slice 8: certificate generation (T-4, T-28, NFR-18) - Phase 1 complete except parked 5b
13b9920 Fix NFR-05 audit gap: log question_created and question_edited
```

## Six open business decisions (see CLAUDE.md "Open items")

Never guess on these — if a task touches one, stop and ask the same way
this session did. Current state of each:

1. **What happens after 2 failed attempts?** Blocked/flagged/other —
   unanswered. Cap is enforced; consequence isn't decided.
2. **Sector reassignment mid-program** — does quiz progress carry over or
   reset? Unanswered; reassignment works, left as a TODO in
   `src/lib/admin/assign-sector.ts`.
3. **Who owns the lesson-complete → quiz-unlock check** — the testing
   engine or the content system? Currently implemented inside the
   testing engine as a standalone function, tagged `open-item-3`, callable
   by whoever ends up owning it.
   - **3b.** Does T-9 mean sequential ordering across a sector's *entire*
     lesson sequence, not just single-lesson unlock? Needs CEO
     confirmation before Phase 1 launch — retrofitting order-enforcement
     later is expensive.
4. **Manual grading pass bar** — see "Current status" above. Now
   specifically reframed as partial-credit vs. binary grading; awaiting
   CEO answer.
5. **Notification rules** — triggers, channels, wording. Not yet defined
   at all.
6. **FR-26 (Call Library & Evaluation)** — flagged for a change in a
   recent meeting, no detail captured yet.
7. *(Not a CEO decision, a content-authoring constraint)* — 95% passing
   grade is only reachable at question counts where it lands on a whole
   number (e.g. 20 questions → 19/20). A quiz with a count where 95%
   falls between two integers (e.g. 10 questions → 90% or 100%, never
   95%) can never be passed — the engine scores exactly, no rounding.
   Whoever sets question counts per quiz (Ibrahim's content team) needs
   to know this. Flagged in `CLAUDE.md` and next to the fixture counts in
   `prisma/seed.ts`.

## Known engineering fragilities (not business decisions — just caveats)

- `TODO(ownership-audit-1)` in `src/lib/quiz/attempt-lifecycle.ts`
  (`finalizeAttempt` and `syncExpiry`): both trust `attemptId`
  unconditionally with no ownership check of their own. No live bug today
  — every current call site pre-verifies the attemptId belongs to the
  caller — but a future route calling either directly with a
  client-supplied attemptId would have no independent safeguard against
  acting on another trainee's attempt. Worth checking before adding any
  new call site.

## Architecture notes worth knowing before you touch things

- **RBAC goes through one gate.** `src/lib/auth/rbac.ts`'s `requireRole()`
  is the *only* permission check in the codebase — never a scattered
  `isAdmin()`-style boolean. This is deliberate: the 2-role model
  (Trainee/Admin) may re-split into a distinct Trainer/Training Manager
  role later, and centralizing the check means that's a one-enum-value +
  one-permission-list change, not a repo-wide hunt.
- **Audit logging (NFR-05)** goes through `recordAudit()` in
  `src/lib/audit/log.ts`. 8 actions logged so far — see the NFR-05 row in
  `docs/fr-to-code.md` for the full list. If you add a new Admin mutation,
  it almost certainly needs a `recordAudit` call too (this is exactly the
  gap the last commit fixed — `createQuestion`/`editQuestion` were
  missing it while `retireQuestion` in the same file had it).
- **Question bank state machine:** every question — AI-drafted or
  manually authored — starts as `DRAFT` and needs explicit Admin approval
  before it's eligible for a live quiz. No bypass for manual authorship.
  Editing an already-approved question resets it to `DRAFT`. This is a
  hard gate per CLAUDE.md, not a default that can be loosened.
- **Versioning:** editing a question archives the pre-edit content as a
  `QuestionRevision` before applying changes — historical attempt records
  are never retroactively affected.
- **Arabic PDF rendering (certificates):** if you touch
  `src/lib/certificates/pdf.ts`, know that Arabic glyphs only render
  correctly with a *full, non-subsetted* font carrying its GSUB
  shaping table. Fontsource's web-optimized WOFF packages strip that
  table (browsers do shaping themselves; `pdf-lib` does not) and silently
  produce a blank-looking page — this cost real debugging time to
  diagnose. Current font is `noto-sans-arabic`'s raw `.ttf` files. Also:
  Western digits are used deliberately inside Arabic certificate text,
  not Arabic-Indic numerals, to avoid a bidi-reordering bug in this
  pipeline.
- **No background schedulers.** Time-dependent state (quiz auto-submit on
  expiry, certificate auto-generation once all required quizzes pass) is
  computed lazily on read/access, not via a cron job or queue. This is a
  deliberate pattern established early and repeated — follow it for
  anything similar rather than introducing a scheduler.
- **Prisma `Json` field gotcha:** for a nullable `Json` column, using
  `undefined` in an `update()` means "leave the existing value alone," not
  "clear it." Use `Prisma.DbNull` to actually null it out. Got bitten by
  this once in `src/lib/questions/manage.ts` (editing an MCQ into a
  FREE_TEXT question left stale `options` data) — fixed, with a
  regression test, but worth knowing if you write similar update calls
  elsewhere in the schema.

## Secrets / repo hygiene

Just audited (2026-07-20): `.gitignore` correctly excludes all `.env*`
files except `.env.example`, plus `node_modules`, `.next`, and the
generated Prisma client. Full commit history was scanned for
secret-shaped strings (API keys, private key PEM blocks, credentialed DB
URLs) — clean, nothing to scrub before pushing to GitHub. `.env.example`
has placeholders only.

## Suggested first steps for a coworker picking this up

1. Read `CLAUDE.md` in full — it's the always-loaded source of truth and
   will shape how any AI agent should behave in this repo.
2. Skim `docs/fr-to-code.md` for exact per-requirement status — don't
   trust this file's summary over that table if they disagree.
3. Copy `.env.example` to `.env` and `.env.test`, fill in real local
   values (Google OAuth creds, generate an `AUTH_SECRET` and an Ed25519
   signing key per the instructions in the file).
4. Run the test suite (`npm test` or equivalent) to confirm a clean
   baseline before making changes.
5. If picking up new work, check the two blocked items above first —
   there's a good chance whatever's next depends on one of them.
