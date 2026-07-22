# Next Steps — 2026-07-23

Execution plan for the day after the Phase-1 completion merge. Written
2026-07-22 against `main` = `c81fb70` (both tracks merged, working tree clean,
CI green at 41 test files / 209 tests). Every claim below was re-verified
directly against the code on 2026-07-22, not recalled from earlier docs.

## 0. How to read this doc

- **CLAUDE.md stays the rules authority.** Nothing here changes a rule or
  decides an Open item — the decision queue (§2) poses questions with
  recommendations; only the owner answers them. The standing rule is
  restated here on purpose: **if a task touches a CLAUDE.md Open item, STOP
  and ask.**
- **Faris** (testing engine): read §1, §3, §4, §6, §8.
- **Ibrahim** (content/LMS): read §1, §5, §6, §8.
- **Owner/CEO**: §2 is yours — five of the eight items cost minutes.
- §7 is the do-not-start list. If a task isn't in §4/§5/§6 or explicitly
  unblocked by a §2 answer, it belongs in §7 — don't pick it up by accident.

## 1. Tomorrow at a glance

| When | Who | What |
|---|---|---|
| 09:00 | Both devs | Pull `main`, read this doc |
| 09:00 | Owner | D1 + D6 + D7 (≤15 min total); schedule a D2/D3 session this week |
| Morning | Faris | Branch for F1; send the C1 answer to Ibrahim |
| Morning | Ibrahim | Branch for I1 |
| On key arrival | Faris | Pause, run the 5b verification (§3, ~15 min), record the result in HANDOFF.md, resume |
| Afternoon | Faris | F2 + F3 |
| Afternoon | Ibrahim | I1 continues |
| EOD | Both | Branches pushed, CI green; note any D4/D5 answers the owner produced |

## 2. Owner/CEO decision queue

Ranked by leverage per minute of owner time. Format: question → options →
recommended default → what it unblocks.

**D1 — Provide the `ANTHROPIC_API_KEY`.** An action, not a decision, but it
tops this list because it is the project's only externally-blocked item (§3)
and, via the standing no-stacking rule, gates F4 and all further
question-bank work. Cost: minutes.

**D2 — Deployment target.** The deciding question (from
`docs/deployment.md`, which this doc defers to rather than re-argues): does
company policy require data residency in Saudi Arabia? No → Option A,
Vercel + managed Postgres (the doc's recommended default). Yes → Option B,
self-hosted KSA-region VM. Also needed: DB provider/region and the
production domain. Unblocks: NFR-03 (TLS), NFR-14 (uptime), NFR-15
(backups), production OAuth callback URLs, and D3. Not a tomorrow-morning
decision — schedule the session this week.

**D3 — Storage backend for uploaded content assets.** Currently hard-coded
local disk in `src/lib/content/upload-asset.ts` (explicitly dev-only; the
swap is deliberately localized to that one file). Options follow from D2:
Vercel Blob or S3 under Option A; local/MinIO on the VM under Option B.
Recommended: decide in the same session as D2. Unblocks: production-ready
FR-12 uploads and FR-11 serving real video/PDF.

**D4 — Sector-scope uploaded asset URLs?** Today `/uploads/content-assets/*`
files are served as Next static files gated only by
any-authenticated-session (`src/proxy.ts` matcher → `authorized` callback in
`src/auth.ts`); there is no sector check, so a trainee in one sector could
fetch another sector's asset by URL. Options: (a) accept auth-only gating
deliberately; (b) serve assets through an API route with a sector check.
**Recommended: (b).** Content assets are exactly the material FR-13/NFR-02
promise to scope server-side; the public certificate-verify endpoint is not
a precedent — that one is public *by design*. Urgency: **launch gate for I1
reaching real trainees** (the same way item #3b was a launch gate), because
FR-11 is what will first put these URLs in front of trainees. If (b), the
implementation lands on Ibrahim's track (his upload/serving code), with
Faris reviewing the gate.

**D5 — Open item #2's two recorded edges** (both currently incidental
behavior, not decisions):
- (a) Does an already-earned certificate from the old sector stay visible to
  the trainee after reassignment? Today it disappears from
  `src/app/(trainee)/certificate/page.tsx` (current-sector-scoped query)
  while the row, direct link, and public verify endpoint all survive.
  **Recommended: keep earned certificates visible regardless of current
  sector** — a credential was earned, the row is never deleted, and the
  current invisibility is an accident of query shape. If accepted: small
  query change on that page.
- (b) What happens to an attempt in progress at the exact reassignment
  moment? Today it freezes — reads and writes start failing with
  `ForbiddenError`, the attempt stays `IN_PROGRESS` until its natural
  `expiresAt` passes and something later reads it in a sector-matching
  context. **Recommended: keep the freeze and document it as intended** —
  zero code, safe, reversible; force-finalizing is only worth it if the
  owner wants tidier dashboards.

**D6 — Ack FR-01 (phone/email + OTP login) as superseded.** It contradicts
the confirmed SSO-only decision (FR-02/FR-03, T-27, CLAUDE.md "Google
Workspace SSO only … no separate password auth"). Recommended: yes, so the
traceability row can be closed and no future session builds dead scope.

**D7 — Governance trio** (drafted in HANDOFF.md Addendum 5, never executed):
enable branch protection on `main` (`gh` commands already drafted); delete
the merged `origin/claude/handoff-project-plan-1e20yo` branch; confirm the
stray `fairs` file / commit `51a8aae` was intentional (and whether to remove
it). ~5 minutes total; closes the discipline-instead-of-server-side-gate
exposure Addendum 5 documents.

**D8 — FR-26 scope capture.** FR-26 (Call Library & Evaluation) was
reassigned to Ibrahim's track with "a pointer, not a spec" — no requirements
captured. Owner briefs Ibrahim; nothing can be scheduled until then.

**Explicitly absent from this queue:** open item #4's implementation
preconditions — sandbox vs. live product for the new AI-grading calls,
consent/retention rules for voice/video submissions, cost, and a Gemini API
key/budget. They are listed so they aren't forgotten, but marked
not-urgent-for-tomorrow: nothing in §4/§5 is blocked on them; they gate only
the T-26 pipeline, which sits in §7 regardless.

## 3. The one blocked-on-external item — slice 5b

The AI drafter's **failure path is verified against the real Anthropic API**
(an invalid key produced a genuine 401, correctly normalized to
`AiProviderError`). The **success path has never run** — real generation,
real JSON parsing, real validation against genuine model output. The moment
D1 produces a key, run from the project root:

```
ANTHROPIC_API_KEY=<real key> \
DATABASE_URL="postgresql://engineer@localhost:5432/rewaa_academy_dev?schema=public" \
npx tsx scripts/verify-ai-drafter.ts
```

Expected: real rows created as `DRAFT`/`AI_DRAFT` (never auto-approved — the
human-approval hard gate), sane parse/validation pass-rate, any rejections
logged to `AuditLog` (`ai_draft_rejected`). ~15 minutes. The script is
deliberately excluded from tests/CI (needs a real key, writes real dev-DB
rows). Record the result in HANDOFF.md.

**Sequencing rule (standing, restated): F4 and any further question-bank
work start only after this passes.**

## 4. Faris — testing engine tasks (ready to start, no decisions pending)

### F1 — Eager-write `QuizFailureRecord` on finalization (top priority)

- **Why now:** the permanent `everFailed` dashboard fact is required
  verbatim by resolved Open item #1 ("the dashboard must record two
  permanent facts"). Today the only write site is `getQuizOutcome`
  (`src/lib/quiz/outcome.ts:103-109`), which is trainee-session-scoped and
  lazy; `submitAttempt` (`src/lib/quiz/submit-attempt.ts`) and
  `finalizeAttempt` never write it, and the admin dashboard
  (`src/lib/dashboard/quiz-dashboard.ts:92`) reads via the pure
  `computeQuizOutcome` plus a separate `findMany`. So a trainee who fails
  attempt 2 and never triggers another outcome read leaves the flag
  permanently unset. Ibrahim's cross-track check flagged this as "yours to
  decide"; this plan decides: close it.
- **Files:** new `src/lib/quiz/failure-record.ts`; `src/lib/quiz/attempt-lifecycle.ts`;
  a small extraction from `src/lib/quiz/outcome.ts`.
- **Approach:** first extract the pure `computeQuizOutcome` (+ its types)
  into `src/lib/quiz/compute-outcome.ts`, re-exported from `outcome.ts` for
  existing importers. **This is not optional refactoring — `outcome.ts`
  already imports `syncExpiry` from `attempt-lifecycle.ts`, so having
  `attempt-lifecycle.ts` import outcome logic back creates a module cycle.**
  Then add `recordFailureIfFinal(userId, quizId)` in the new
  `failure-record.ts`: load the trainee's attempts for the quiz, get
  `getAllowedAttempts` (`src/lib/admin/attempt-override.ts`), run
  `computeQuizOutcome`, and do the same idempotent `upsert` (`update: {}`)
  the existing site does, iff status is `FAILED_FINAL_ATTEMPT`. Call it from
  `finalizeAttempt` after its transaction resolves, only when the finalized
  attempt has `passed === false` (a `PENDING_MANUAL_GRADE` routing can never
  be `FAILED_FINAL_ATTEMPT` — `computeQuizOutcome` resolves those to
  `AWAITING_MANUAL_GRADE`). One hook in `finalizeAttempt` covers every
  finalization path: explicit submit, `syncExpiry` auto-submit, and
  dashboard-triggered expiry. Keep the existing lazy write in
  `getQuizOutcome` — it's idempotent and backfills any rows missed before
  this ships; note in a comment that it's now redundant for new failures.
- **Tests** (new `src/lib/quiz/failure-record.test.ts`, or extend
  `redo-loop.test.ts`): (1) fail both attempts purely via `submitAttempt`,
  never calling `getQuizOutcome` → row exists and `getQuizDashboard` shows
  `everFailed`; (2) attempt 2 expires and finalizes via `syncExpiry` from a
  non-outcome read path → row exists; (3) fail 1 of 2 → no row; (4) with an
  `AttemptCapOverride` in play → no row until the *last allowed* attempt
  fails.
- **Acceptance:** no code path producing `FAILED_FINAL_ATTEMPT` leaves the
  record unwritten; `computeQuizOutcome` stays pure/DB-free (the dashboard's
  batched cohort loop and NFR-08's ~71ms depend on it); full suite green.
- **Size:** ~half day.

### F2 — `TODO(ownership-audit-1)` hardening

- **Why now:** `finalizeAttempt` (`src/lib/quiz/attempt-lifecycle.ts:31`)
  and `syncExpiry` (`:93`) trust `attemptId` unconditionally. No live bug —
  every current call site pre-verifies ownership — but any future route
  calling either with a client-supplied id has no independent safeguard.
  Cheap to close before more routes exist.
- **Approach:** add a required caller-context parameter to both —
  `{ traineeId: string } | { context: "admin" }` — throwing `ForbiddenError`
  on trainee mismatch *before any write*. The dashboard's cross-user
  `syncExpiry` calls (`quiz-dashboard.ts:70-72`) are legitimate — they run
  after `requireRole(session, ["ADMIN"])` and pass `{ context: "admin" }`;
  that escape hatch is part of the design, not a loophole. ~6 mechanical
  call-site edits (start-attempt, save-answers, submit-attempt, outcome,
  attempt-view, dashboard). Precedent: `src/lib/quiz/attempt-view.ts:130`
  (ownership first, then `syncExpiry`). Delete the satisfied TODOs.
- **Tests:** mismatched `traineeId` → `ForbiddenError`, no state change;
  admin context still finalizes expired attempts.

### F3 — Stale comment fix (bundle with F2)

`src/lib/admin/assign-sector.ts:9-13`'s `TODO(open-item-2)` body still
claims "No quiz-attempt model exists yet." Item #2 is resolved and
implemented; rewrite the comment to reference the resolution and its two
still-open edges (D5). F2+F3 together: ~half day.

### F4 — Ground the AI drafter in published lesson content (after §3 passes)

- **Why:** `DraftPromptInput` (`src/lib/ai/drafter.ts:15-20`) receives only
  `lessonTitle`/`unitName`/`skillType`/`count` — every AI-drafted question
  today is generated from a title string. `ContentItem.body` (ARTICLE) now
  exists and is reachable via `Lesson.contentItems`, so the long-flagged
  content-grounding gap is buildable. This work also *is* the substance of
  Faris's C1 answer.
- **Files:** `src/lib/ai/drafter.ts` (optional `lessonContent?: string` on
  `DraftPromptInput`, included in `buildPrompt` when present);
  `src/lib/questions/draft.ts` (load `contentItems` where
  `type: "ARTICLE"` **and `status: "PUBLISHED"`**, ordered by `order`;
  strip HTML to plain text; truncate to an explicit character budget, ~8k
  chars).
- **Tests** (extend `src/lib/questions/draft.test.ts`, existing
  injected-fake-drafter pattern): published ARTICLE bodies included in
  order; **DRAFT bodies excluded — a named guardrail test**; the
  no-articles case degrades cleanly to today's title-only prompt.
- **Acceptance:** prompt contains published article text only; no schema
  change; `scripts/verify-ai-drafter.ts` re-run passes.
- **Size:** ~half day + the verify re-run. **Strictly sequenced after §3**
  (the no-stacking rule).

## 5. Ibrahim — content track tasks

### I1 — FR-11 trainee-facing content view (biggest item, 1–2 days)

- **Why now:** the only remaining gap in the trainee journey. Admin
  authoring (FR-12) shipped with nothing rendering it; the trainee lesson
  page is still title-only. This is also the event that makes D4 real.
- **Files/approach:** render PUBLISHED content items on
  `src/app/(trainee)/lessons/[id]/page.tsx` via a **new trainee-scoped read
  helper** (e.g. `src/lib/content/trainee-content.ts`) rather than reusing
  the admin-oriented list code — it must filter `status: "PUBLISHED"`
  unconditionally and preserve the existing foreign-sector-404 behavior
  (`src/lib/content/trainee-progress.ts` is the precedent). Per-type render
  components for VIDEO/PDF/ARTICLE/IMAGE, ordered by `ContentItem.order`.
  **Sanitize ARTICLE HTML before rendering** (admin-authored, but it crosses
  a trust boundary into trainee browsers — use a named sanitizer, not raw
  `dangerouslySetInnerHTML`). Keep the manual `CompleteLessonButton` —
  **do not change what writes `LessonCompletion`**; that `(userId, lessonId)`
  contract is the cross-track promise, and auto-derived completion is a
  later, coordinated change. Arabic-only, RTL, mobile-first per existing
  pages.
- **Tests:** DRAFT items never returned (a named regression, mirroring the
  answer-key-redaction discipline); ordering respected; foreign-sector
  lesson still 404s. Manual browser walkthrough per the established
  pattern.
- **Gate:** dev-complete anytime; **shipping to real trainees waits on D4.**
  Update the FR-11 traceability row when done.

### I2 — Asset-model schema proposal (after C1's answer arrives)

The written proposal for structured assets (hotspot/coordinate data, source
content for drafter grounding). Two constraints: the `prisma/schema.prisma`
standing rule applies (direct check-in with the humans before touching the
file), and it should be **batched with the drafted-not-applied
`VOICE_PROMPT`/`ACTION_SIMULATION` QuestionType proposal** from the testing
track so the humans review one schema change, not two (see also C3).

## 6. Cross-track coordination

- **C1 — Faris answers Ibrahim's open question** (one message; unblocks I2).
  The question, verbatim from CLAUDE.md: *"when you eventually ground
  AI-drafted questions in real lesson content, what form does the drafter
  need that content in — full rich text/HTML, a plain-text extract,
  section-level chunks? And for action-simulation hotspot grounding, do you
  need anything beyond 'an image plus a list of {x, y, label} target
  regions'…?"* Proposed answer for Faris to confirm: (a) a **plain-text
  extract suffices** — F4 strips HTML itself, so storing full HTML in
  `ContentItem.body` is fine and no new content-model field is needed;
  section-level chunks are a later nice-to-have. (b) Hotspots: image +
  `{x, y, width, height, label}` **plus a stable asset ID and the image's
  natural pixel dimensions**, so coordinates have a declared coordinate
  space.
- **C2 — Item #7 message to the content team** (whoever sets per-quiz
  question counts): with exact-fraction scoring, at question counts below
  20 the effective pass bar is 100% (one wrong answer fails), and
  exactly-95% is only attainable at multiples of 20. Authoring rule to
  communicate: **20 questions per quiz unless deliberately choosing an
  all-or-nothing quiz.** Optional backlog item: an authoring-time warning in
  the admin question-bank UI.
- **C3 — `Lesson.order` field proposal** (schema-gated, joint sign-off):
  the chain-ordering unlock (`src/lib/content/quiz-unlock.ts`) uses
  createdAt-within-`Unit` as a documented stand-in. Proposal: add
  `order Int` to `Lesson` mirroring `ContentItem.order`, backfill by
  `createdAt`, update the unlock query to `orderBy: [{order}, {createdAt}]`,
  and extend `quiz-unlock.test.ts` with an out-of-creation-order case.
  Small, but it is a schema change → not startable unilaterally; batch with
  I2's proposal (one schema review covering all three pending changes).
- **C4 — Discipline reminders:** shared-file list from HANDOFF Addendum 5
  (`prisma/schema.prisma`, `src/auth.ts`, `src/lib/dev/demo-users.ts`,
  `src/app/(admin)/admin/layout.tsx`, `package.json`,
  `.github/workflows/ci.yml`, `.claude/hooks/session-start.sh`); pull
  `main` at session start; never push to `main` directly (until D7 makes
  that mechanical).
- **C5 — Seed realism (backlog):** every seeded `Unit` holds exactly one
  lesson, so chain ordering is never exercised by fixtures. After C3 lands,
  add a second lesson to one seeded Unit — deliberately, not casually: seed
  changes ripple through CI and 41 test files.

## 7. Explicitly NOT now

| Parked item | Why |
|---|---|
| Phase-2 T-29/30/31/34/35 (video/voice/simulation tests) | Phase-2 embargo + open item #4 preconditions unanswered |
| T-26 auto-grading pipeline, Gemini integration, action-simulation engine | CLAUDE.md: "Do not start building… until those are answered." Manual grading queue stays as-is |
| Applying the drafted `VOICE_PROMPT`/`ACTION_SIMULATION` schema | schema.prisma standing rule + item #4; batch per C3/I2 |
| Notifications (FR-25, open item #5) | ON HOLD by owner — "not crucial"; revisit only if raised |
| FR-21 / FR-22 / FR-27 | Not started, not prioritized this cycle |
| Building against `ContentAsset.hotspots`' provisional Json shape | Ibrahim's own "don't build against its shape yet" |
| Changing the `LessonCompletion` write path / auto-derived completion | Cross-track contract; later coordinated change |
| Deeper dashboard analytics beyond shipped T-24 | Phase-1 dashboard is basic on purpose |

## 8. Risks & sequencing traps

1. **F1's upsert must never move into `computeQuizOutcome`** — it is pure by
   documented design and called per-trainee in the dashboard's batched
   cohort loop (NFR-08's ~71ms depends on it). The comment at
   `outcome.ts:94-102` says exactly this; keep it true.
2. **The `outcome.ts` ↔ `attempt-lifecycle.ts` import cycle** — extract the
   pure compute module first (F1's first step), or the fix becomes a subtle
   ESM-cycle bug.
3. **Drafter grounding must filter `status: "PUBLISHED"`** — DRAFT lesson
   text leaking into AI prompts (and thence into approved questions) is the
   content-side sibling of the no-auto-publish hard gate. Named test
   required.
4. **5b-first sequencing for F4** — cheap to honor; don't shortcut it.
5. **`prisma/schema.prisma` is human-gated** — three proposals are pending
   (QuestionTypes, asset model, `Lesson.order`); batch them into one review,
   and none is startable unilaterally.
6. **FR-11 makes the un-sector-scoped asset URLs live for trainees** — treat
   D4 as a launch gate the way item #3b was.
7. **F2 must not break the dashboard's legitimate cross-user `syncExpiry`**;
   every role check stays via `requireRole()` (`src/lib/auth/rbac.ts`) —
   never a scattered boolean.
8. **CI runs the full pipeline on every push and there is no branch
   protection yet (D7)** — a red branch blocks the other track's rebases;
   new tests follow the sequential-Vitest/real-Postgres pattern.

## 9. Housekeeping delivered with this doc (same branch)

- `docs/fr-to-code.md` rows corrected against verified code state: T-9
  (chain-ordering unlock is implemented — was "Partial/pending CEO
  confirmation"), NFR-06 (5c/5e long shipped; remaining gap is only future
  AI evaluations), T-36 (revision history + restore UI shipped — row
  contradicted FR-12's), FR-11 (admin authoring exists; the gap is the
  trainee view, task I1), FR-14 (stale "no attempt model exists yet"
  clause), FR-01 (noted as contradicting the SSO-only decision — status
  flip itself is D6, an owner call).
- `HANDOFF.md`: Addendum 6 pointer to this doc + `Last updated` bump.
- Deliberately **no code changes** on this branch — the stale
  `assign-sector.ts` comment is bundled into F2/F3 instead, keeping this
  branch pure markdown.
