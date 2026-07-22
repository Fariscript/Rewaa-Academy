# Handoff — Rewaa Sales Academy (Testing & Assessment Engine)

Last updated: 2026-07-21 (Addendum 5 below; the slices 9–15 update and the
original snapshot beneath it are kept as-is where still accurate).

## Addendum 5 — main merge verification, parallel-session split, shared files

Note on numbering: no file anywhere in this repo (checked via full-text
search across `*.md`, including everything the slices 9–15 merge brought
in) contains the word "Addendum" before this one. If Addenda 1–4 exist,
they're external to this repo — this section doesn't assume or reference
their content, only that this is "Addendum 5" per an explicit instruction
this session. Treat it as self-contained.

### Verified git state (this session, immediately before session end)

Everything below was checked directly against `git` output at time of
writing, not recalled from earlier in the session — re-run the commands
yourself if this doc is more than a few days old.

- **`main` — locally and on `origin/main` — is at commit `afd965a`**
  ("Merge remote-tracking branch 'origin/claude/handoff-project-plan-1e20yo'"),
  and `origin/main` is byte-identical to local `main` (both resolve to the
  same SHA). This merge brought in slices 9–15 (trainee + admin UI, CI,
  README/deployment docs, review-fixes pass, smoke tests) **plus** two
  commits that arrived on the remote branch after the merge was first
  scoped: `bf8c6c6` (Slice 16 — question-bank admin UI) and `a83b848`
  (T-24 — Phase 2 per-trainee reports/trends). Both were merged only after
  explicit confirmation this session that they were authorized elsewhere
  (see "Parallel sessions" below) — their own commit messages self-report
  an "owner directive," which this session could not independently verify
  beyond noticing the different `Claude-Session` ID.
- **The "Local demo login for CEO demo" work is NOT on `main` or
  `origin/main`, in any form.** It exists as three separate commits with
  identical file content but different hashes (an artifact of being
  committed from the same dirty working tree onto different branch
  pointers at different times) — `2d793f7` (branch
  `claude/handoff-project-plan-1e20yo`), `e3876c3` (branch
  `local-demo-login`), and `d3c8f6d` (branch `demo-login-latest`, a clean
  cherry-pick of `e3876c3` onto post-merge `main` — verified: no leftover
  cherry-pick state, no conflict markers, identical diff content to the
  original commit, `tsc`/`eslint` clean). Direct proof of absence:
  `git log main --oneline --grep="demo login" -i` and the same against
  `origin/main` both return nothing.
- **A pre-existing commit unrelated to any of this session's work sits on
  `main`:** `51a8aae "Add initial content to fairs file"`, authored by
  `FarisAlsaif`, adding a one-line file named `fairs` containing "Salam".
  Harmless, but flagged again since nothing in this session's history
  explains it — confirm it was intentional.
- **Branch protection on `main` is intentionally NOT enabled yet** (not an
  oversight — see "Working without branch protection" below for what
  substitutes for it in the meantime), and the merged remote branch
  `origin/claude/handoff-project-plan-1e20yo` still exists (points at the
  same commit as `main`, not yet deleted). `gh` commands for both branch
  protection and the branch delete were drafted this session for Faris's
  review, not run.

### Open business-rule items — current state after the merge

Per `CLAUDE.md`'s "Open items" section (the authoritative list — no
"Addendum 3" or similar exists in this repo to cross-reference instead).
None of the six are resolved by the slices 9–15/16 + T-24 merge. Two are
touched indirectly:

1. **2 failed attempts, consequence** — still fully open. Touched
   indirectly: slice 10 added `AttemptCapOverride` (Admin can grant +1
   attempt, audited) and the trainee-facing "both attempts failed" UI
   state — both are explicit in code comments and copy that they do NOT
   decide this item, only provide an escape valve / state the fact
   neutrally.
2. **Sector reassignment mid-program, progress carryover** — not touched
   by the merge (searched the full merge diff for sector-reassignment
   content; only match was an unrelated optimistic-UI fix to the sector
   picker).
3. / **3b.** **Lesson-unlock ownership / sequential ordering** — not
   resolved, but **escalated**: `CLAUDE.md` and `HANDOFF.md` were both
   updated in the merge to call 3b "now a launch gate" — since the trainee
   UI exists as of slices 11–13, real trainees getting unordered
   cross-lesson access is now a live risk, not a theoretical one. **This
   is the one worth raising with the CEO soonest.**
4. **Manual grading vs. 95% bar (T-26)** — not resolved. Slice 15 built
   the grading UI on top of the existing gate, deliberately isolating the
   binary correct/incorrect input into one component so a future answer
   only changes that component + `gradeAnswer`. T-24's own commit message
   independently confirms T-26 "remains blocked on open item #4."
5. **Notification rules** — not touched at all by the merge.
6. **FR-26 (Call Library & Evaluation)** — not touched at all by the merge.

(Item #7 — the 95%-unreachable-at-some-question-counts content constraint —
isn't a business-rule decision per CLAUDE.md's own framing, so not counted
among the six; unchanged by the merge.)

### Parallel sessions — work is now split

As of 2026-07-21, work on this repo is split across two parallel Claude
Code sessions, per Faris. The split is by *ownership of concern*, not by
directory — both sides touch overlapping files, which is exactly why the
"Shared files" list below matters:

- **This session (testing platform + statistics)** — the quiz runner
  (attempt lifecycle, countdown/autosave, scoring), attempts (start/save/
  submit/read views, the 2-attempt cap and overrides), grading (manual
  grading queue + finalization), results (outcome computation, the result
  page), certificates (issuance, PDF, signing/verification), and admin
  dashboard statistics (per-quiz dashboard tiles, trainee reports, quiz
  trends). Also owns **how a trainee's sector assignment drives which
  question bank they're tested from** — i.e. the read side of `sectorId`,
  from quiz assembly's perspective.
- **Ibrahim's session (LMS)** — the trainee UI foundation (shell, layout,
  navigation), the admin shell, **the sector-assignment UI and admin
  action itself** (the write side of `sectorId` — assigning/reassigning a
  trainee), and how a trainee's sector drives which courses/content they
  see. This matches `CLAUDE.md`'s original owner line ("Content management
  is a separate track (Ibrahim)"), now made concrete as an actual parallel
  Claude Code session.

The sector-assignment boundary is the sharpest edge between the two: the
`sectorId` field and its assignment action belong to Ibrahim's track;
this session only ever *reads* it to decide which quizzes/questions a
trainee sees. Neither side should change what `sectorId` means or how
it's set without the other knowing.

The slice 16 and T-24 commits merged today were built by a *third*
identifiable session (`Claude-Session:
https://claude.ai/code/session_01MJ9vZFJ4JGwhn2Wd3FMxNn`, co-authored by
"Claude Fable 5") — worth Faris confirming which of the two ongoing
tracks (or a third, cloud/web one) that session actually is, since its
commits self-reported an owner directive this session had no way to
verify independently.

### Shared files — coordinate before either side edits these

This is the specific, curated list (per Faris, replacing this session's
earlier broader guess) of files where an uncoordinated concurrent edit
from either track is most likely to silently clobber the other side's
work — this session hit exactly this failure mode once already today,
with two sessions both editing `package.json`'s scripts block
near-simultaneously:

- **`prisma/schema.prisma`, especially the `Sector` model** — the one
  data model both tracks depend on for opposite reasons (Ibrahim writes
  assignment, this session reads it for quiz/question scoping). Any shape
  change to `Sector` or `sectorId` needs both sides in the loop before it
  lands, not after.
- **`src/auth.ts`** — the single NextAuth config (providers, session
  strategy, callbacks) both tracks' routes and pages sit behind.
- **`src/lib/dev/demo-users.ts`** — the fixed demo-account allow-list used
  by the local-only `DEV_LOGIN_ENABLED` flow; both tracks' demo/smoke
  flows depend on these 3 accounts staying stable.
- **The admin shell/layout** (`src/app/(admin)/admin/layout.tsx`) — owned
  by Ibrahim's track, but this session's admin pages (dashboard, grading,
  trainees) all nest under it, so shell/nav changes ripple into both.
- **`package.json`** — shared dependency/script manifest — the exact file
  that already collided once today.
- **CI config** (`.github/workflows/ci.yml`) — one shared pipeline both
  tracks' tests and builds run through.
- **`.claude/hooks/session-start.sh`** — the shared cloud/web-session
  bootstrap (Postgres provisioning, `.env`/`.env.test` synthesis, migrate
  + seed for both DBs); a change here affects the environment both
  sessions' web/cloud instances start from.

### Working without branch protection — the discipline

Branch protection on `main` is intentionally off for now (see above) —
this is a deliberate choice, not a gap waiting to be filled, and it means
both sessions are relying on discipline instead of a server-side gate
until it's turned on:

1. **Never push directly to `main`.**
2. **Always work on a named branch**, not directly on `main` locally.
3. **Pull `main` at the start of every session**, before doing anything
   else — given two tracks are landing work independently (as today's
   `git pull` mid-merge surfaced two commits neither side had told the
   other about), starting from a stale `main` is the likeliest way to
   produce exactly the kind of surprise this addendum documents.

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

- **2026-07-21, by explicit owner directive ("continue working on the
  next phases"):** slice 16 (question-bank UI) built — the hold was lifted
  since its APIs were already tested; the AI-generation verify
  (`scripts/verify-ai-drafter.ts`) is STILL required once a key exists.
  Smoke gained 5 question-bank stages (create→approve→edit→re-approve→
  retire with audit assertions). Phase 2's key-independent item (T-24
  analytics) is next; the AI-powered Phase 2 features and T-26 remain
  blocked on the key and open item #4 respectively.
- **Perf sanity (NFR-08/NFR-16), measured 2026-07-20 via
  `scripts/perf-sanity.ts`** (throwaway 301-trainee cohort, 600 finalized
  attempts, dev server medians): per-quiz admin dashboard **~71ms** (was
  ~1.0s before batching its per-trainee queries into one attempts read +
  one override aggregate — commit history has the change), quiz catalog
  ~28ms, trainee content API ~27ms, home SSR ~150ms. Re-run the script
  after touching `src/lib/dashboard/` or `trainee-progress.ts`.
- **2026-07-22 — open item #2 (sector reassignment) RESOLVED and
  implemented, unblocked unlike item #4** (no API key/sandbox/cost
  question). Full decision text is in CLAUDE.md. Short version: reassigning
  a trainee starts the new sector's quizzes at zero (already automatic, no
  code needed) and never deletes progress in the old sector — it's
  inaccessible while away, fully restored (exact attempt-cap state) if
  reassigned back. Reads/start-attempt were already sector-scoped; the real
  gap was `saveAnswers`/`submitAttempt` checking ownership but not current
  sector, letting a reassigned-away trainee still mutate an old attempt —
  fixed with a shared check in `attempt-lifecycle.ts`, regression test in
  `src/lib/quiz/sector-reassignment.test.ts`. Two edges (certificate
  validity after reassignment; an attempt in-progress at the exact
  reassignment moment — confirmed reachable, not moot) are explicitly left
  open in CLAUDE.md, not guessed at. `src/lib/admin/assign-sector.ts` and
  the sector-assignment UI/action itself were not touched (Ibrahim's
  track).

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
