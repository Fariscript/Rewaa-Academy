# Rewaa Sales Academy — Testing & Assessment Engine

Sector-based sales training platform. This file is the always-loaded source
of truth for build rules — don't ask me to re-paste the requirements doc,
cite the ID (FR-##, T-##, NFR-##) from /docs/fr-to-code.md instead.

Owner: Faris Alghamdi (Testing/Quizzing Engine). Content management is a
separate track (Ibrahim) — don't build content-authoring UI beyond what's
listed below as a dependency.

## Non-negotiable rules

- **Passing grade: 95% per quiz.** (T-02)
- **Attempts: max 2 per quiz.** Highest score is the trainee's final result. (T-03, T-20)
- A "pop quiz" IS a formal test, not a practice item — same rules apply everywhere. (T-01)
- Quiz unlocks only after its lesson is marked complete, but does **not**
  auto-launch. Trainee sees a **"Start Quiz" button**; the attempt and the
  timer begin only once they tap it. (T-07, T-08, T-33)
- Every quiz has a **visible countdown timer**; auto-submits the trainee's
  current answers when time expires. (T-32)
- **Certificate** auto-generates once all required quizzes in a trainee's
  sector are passed. Pulls name + completion date from the SSO identity
  profile. Includes digital signature, downloadable PDF. (T-04, T-28)
- **AI drafts quiz questions.** An Admin must approve, edit, or reject every
  single one before it can reach a trainee. This is a hard gate — no
  auto-publish path, no exceptions. (T-10, T-11, T-12, NFR-06)
- MCQ / true-false → auto-graded. Scenario / free-text / mock-call → routed
  to Admin for manual grading with written feedback. (T-17, T-18, T-25)
  ⚠️ Whether manual grading must also hit 95% is **unresolved** — see Open
  Items below. Don't hardcode an assumption.
- **Content items and question-bank items both support versioning**: edit
  history retained, prior versions viewable/restorable, without altering a
  trainee's already-completed records or scores. (FR-12, T-15, T-36, NFR-13)
- Identity: **Google Workspace SSO only**, restricted to the company domain.
  No separate password auth for this platform. (FR-02, FR-03, T-27)
- **Arabic-only UI.** (NFR-09)
- **Dashboard is a single Admin-only view** (there's only one non-Trainee
  role now — see Roles below): who's completed a quiz, who hasn't, who's on
  attempt 2, average scores, a flag for anyone who failed both attempts,
  plus the taxonomy/sector-assignment/attempt-override controls Admin
  already has. Still **basic in Phase 1 on purpose** — do not build deeper
  analytics/trends early, that's explicitly Phase 2. (T-21–T-24)

## Roles

Two roles only for now — confirmed, no separate Trainer/Training Manager.
**Admin currently covers the company's Manager position, plus anyone else
granted admin access.** This may re-split into a distinct Trainer/Training
Manager role later — build permission checks accordingly: every role check
goes through the single `requireRole()` gate (see `src/lib/auth/rbac.ts`),
never a scattered `isAdmin()`-style boolean, so reintroducing a role later
means adding one enum value and updating permission lists in one place,
not hunting through every route.

| Role | Can do |
|---|---|
| Trainee | Sector-scoped content + quizzes only; sees own attempts/scores; downloads own certificate |
| Admin | Manages taxonomy (sectors/sub-sectors/paths); assigns/reassigns trainees to sectors; can override attempts; approves question bank; grades manual submissions; views testing dashboard |

## Build order

**Phase 1** (in this order — each is a self-contained slice, don't start the
next until the current one has tests passing and is reviewed):
1. Auth/SSO + trainee/role model
2. Sector-scoped content model (dependency on Ibrahim's content system — stub if needed)
3. Lesson-complete → quiz-unlock trigger
4. Quiz engine: Start button, timer, 95%/2-attempt scoring logic
5. Question bank + AI-draft + human-approval workflow
6. Manual grading flow
7. Manager dashboard (basic version only)
8. Certificate generation

**Phase 2** (do not start until Phase 1 has shipped and been reviewed):
Voice quiz (AI asks aloud, trainee replies verbally, AI evaluates — T-31),
AI Voice Call Training (coaching simulation, not scored — T-34), AI Video
Grader (trainee-uploaded video graded by AI — T-35), AI customer-simulation
roleplay (T-30), deeper dashboard analytics (T-24).

## Open items — STOP and ask if a task touches one of these

1. What happens after 2 failed attempts — blocked, flagged for manual
   review, or something else?
2. Sector reassignment mid-program — does quiz progress carry over or reset?
3. Who owns the lesson-complete → quiz-unlock check: the testing engine or
   the content system?
3b. T-9 ("prior required content/quizzes are complete") may mean sequential
    ordering across a sector's whole lesson sequence, not just single-lesson
    unlock. Needs confirming with the CEO before Phase 1 launch — retrofitting
    order-enforcement after trainees already have unordered access is
    expensive to unwind.
4. Does manual grading need to hit the same 95% bar, or is it the grading
   Admin's judgment?
5. Notification rules (triggers, channels, wording) — not yet defined.
6. FR-26 (Call Library & Evaluation) — flagged for a change in the latest
   meeting, but no detail was captured yet.
7. 95% passing grade is only reachable at question counts where it lands on
   a whole number (e.g. 20 questions → 19/20 = 95%). A quiz authored with a
   count where 95% falls between two integer results (e.g. 10 questions:
   90% or 100%) can never be passed. This isn't a code decision — the
   engine scores exactly, no rounding — it's a content-authoring constraint
   that needs communicating to whoever sets question counts per quiz
   (Ibrahim's content team) so quizzes aren't accidentally unpassable.
   Flagged too in prisma/seed.ts next to the fixture question counts.

These are exactly the decisions that cause expensive rebuilds if guessed
wrong. If a task depends on one, implement everything around it and leave
the decision point clearly marked (e.g. a single config value or a TODO
with the open-item number) rather than picking an assumption silently.

## Known fragilities

Not CEO decisions — internal engineering caveats worth grepping for before
touching the related code.

- `TODO(ownership-audit-1)` (`src/lib/quiz/attempt-lifecycle.ts`, both
  `finalizeAttempt` and `syncExpiry`): these trust `attemptId` unconditionally
  and have no ownership check of their own. No live bug — every current call
  site already passes an attemptId that was pre-verified as belonging to the
  caller — but a future route calling either directly with a client-supplied
  attemptId would have no independent safeguard against acting on another
  trainee's attempt.

## Slice 5 decisions (question bank)

Confirmed engineering decisions for the question-bank/AI-draft/approval
workflow, recorded here so they don't get re-litigated:

- Every question starts as `DRAFT` regardless of origin — AI-drafted and
  manually-authored questions both require an explicit approve step; no
  bypass for manual authorship by an Admin.
- Editing an already-approved question resets it to `DRAFT`, requiring
  fresh approval — matches "no auto-publish path, no exceptions."
- AI-draft output validation is **partial success, not all-or-nothing**:
  valid drafted items are created as `DRAFT` questions; malformed items
  (unsupported type, missing/mismatched correct option, empty
  prompt/options) are skipped and never persisted. Rejections are **logged
  to `AuditLog`** (quizId, count requested, count created, the rejected
  array with input + reason per item) rather than silently dropped, so
  there's a durable record even before a question-bank UI exists to
  surface them live.

## Blocked

- **Slice 5b (AI-draft generation) is held incomplete**, not on a code
  issue — it's blocked on a real `ANTHROPIC_API_KEY` not yet being
  available (one will be provided later). Code and tests are done
  (`src/lib/ai/drafter.ts`, `src/lib/questions/draft.ts`,
  `src/lib/questions/draft.test.ts`), and the failure path has been
  confirmed against the **real** Anthropic API — an invalid key produced a
  genuine 401, which `anthropicDrafter` correctly caught and normalized to
  `AiProviderError` rather than an uncaught crash. What's still unverified
  is the **success path**: real question generation, real JSON parsing,
  real validation against genuine (not injected-fake) model output.
  **Do not start slice 5c/5d/5e until this closes** — they don't
  technically depend on it, but slice 5 is being built in order and
  further question-bank work shouldn't stack on top of an unverified
  piece.

  To verify once a key exists, run from the Academy project root:
  ```
  ANTHROPIC_API_KEY=<real key> \
  DATABASE_URL="postgresql://engineer@localhost:5432/rewaa_academy_dev?schema=public" \
  npx tsx scripts/verify-ai-drafter.ts
  ```
  Script: `scripts/verify-ai-drafter.ts` (not run by tests/CI — needs a real
  key and writes real rows to the dev DB).

## Stack

Not specified in the source requirements. Before scaffolding anything,
propose 2–3 stack options against these constraints — Arabic-only UI,
Google Workspace SSO, responsive desktop + mobile, server-side AI calls
(question generation, future voice/video grading), decent uptime and
backups — and get sign-off before writing code.

## Traceability

Every implemented requirement gets a row updated in `/docs/fr-to-code.md`
(ID → files → tests → status). Use the ID (FR-##, T-##, NFR-##) when
referring to a requirement in prompts or commits instead of re-explaining it.
