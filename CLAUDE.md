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
- MCQ / true-false → auto-graded. **Grading direction changed 2026-07-22 —
  see resolved Open item #4 below**: scenario / free-text / voice / video /
  action-simulation items are no longer routed to an Admin for manual
  grading. They're graded automatically, by type (deterministic comparison,
  Gemini for video, or AI-based for open text/voice). (T-17, T-18, T-25,
  T-26) Implementation is NOT started — this is a documentation update
  only; see Open item #4 for what's still blocking the build.
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

**Phase 1 completion run (shipped 2026-07-20, slices 9–15):** trainee
attempt read API + answer-key redaction, admin quiz catalog +
attempt-cap override, CI, and the full trainee + admin UI (home/lesson/
quiz-runner-with-countdown/result/certificate; admin dashboard/trainees/
grading). FR-18 taxonomy CUD and T-36 are deferred to Ibrahim's content
track (owner decision, recorded in docs/fr-to-code.md).

**Slice 16 (question-bank UI) shipped 2026-07-21 by owner directive**,
lifting the earlier hold: the UI sits over APIs that were already fully
tested, and only the AI *generation* call remains unverified — the 5b
verification run in Blocked below is still required the moment a real
key exists, and the AI-draft panel's copy reflects that.

**Phase 2** (do not start until Phase 1 has shipped and been reviewed):
Voice quiz (AI asks aloud, trainee replies verbally, AI evaluates — T-31),
AI Voice Call Training (coaching simulation, not scored — T-34), AI Video
Grader (trainee-uploaded video graded by AI — T-35), AI customer-simulation
roleplay (T-30), deeper dashboard analytics (T-24).

## Open items — STOP and ask if a task touches one of these

1. **RESOLVED 2026-07-22 — the owner's decision, recorded here verbatim.
   This also resolves 3b below** (the sequential-ordering launch gate):
   the rule is neither "single lesson only" nor "strict order across the
   entire sector" — it's **chapter/topic-chain-scoped sequential
   ordering**.

   A trainee who fails both attempts on a quiz is flagged in the admin
   dashboard statistics as failed. They cannot advance to the next lesson
   in the same chapter/topic chain until they redo the failed lesson and
   pass within a fresh 2-attempt window — this repeats indefinitely ("stay
   in loop until they break out") until they pass. The lock is scoped to
   the specific chapter/topic chain only: failing a call-skills lesson
   blocks advancement within that chain, but does not affect or block
   progress in an unrelated chain (the owner's example: a Zoho CRM
   lesson). Finishing a lesson already unlocks its own quiz (item #3,
   already built) — passing that quiz is what gates advancement to the
   next lesson in the same chain; the existing single-lesson unlock check
   itself doesn't change.

   **Both implementation sub-questions are now answered by the owner,
   recorded verbatim:**
   - **Scope: platform-wide, not gated-only.** The redo-loop applies to
     every quiz — there is no gated-only vs. platform-wide split. To
     complete a lesson, its quiz must be passed under the redo-loop model.
     This replaces the old hard-cap-plus-override behavior everywhere, not
     just at chain-ending or advancement-gating quizzes.
   - **The dashboard must record two permanent facts, not a point-in-time
     status:** (a) whether the trainee ever failed both attempts on a
     given quiz, at least once, regardless of later outcome, and (b)
     whether they eventually passed or not. This is the *bigger* of the
     two options this session's investigation flagged — the existing
     `FAILED_FINAL_ATTEMPT`/`failedBothAttempts` status is point-in-time
     only and would lose the "ever failed" fact once a trainee passes, so
     it does not satisfy this on its own; a new persistent field is
     needed. A schema proposal for it was drafted and shared for
     review — **not applied**, per the standing rule to stop before
     touching `prisma/schema.prisma`.

   Implementation (`markLessonComplete`'s redo-detection/fresh-attempt
   grant, `quiz-unlock.ts`'s chain-ordering check, the automatic
   attempt-grant mechanism) is in progress this session, gated on the
   schema proposal above being confirmed before it's applied — see
   `HANDOFF.md` for status.
2. **RESOLVED 2026-07-22 — the CEO's decision, recorded here verbatim:**
   - Reassignment to a new sector starts that sector's quizzes at zero.
     Confirmed already-automatic, no new code needed: quizzes in different
     sectors are different `Quiz` records, and attempt-cap/history queries
     are always scoped to `{userId, quizId}` (`src/lib/quiz/start-attempt.ts`)
     — a trainee has zero existing attempts against a quiz they've never
     been assigned to.
   - Progress in a sector a trainee is reassigned away from is never
     deleted. It becomes inaccessible while they're not currently assigned
     to that sector, and is fully restored — exact state, not just
     history — if they're ever reassigned back. "Exact state" explicitly
     includes attempt-cap consumption: 1 of 2 attempts used resumes as 1
     remaining, not a reset cap.

     **Implemented this session.** Reads (`getQuizOutcome`,
     `getAttemptForTrainee`, `getQuizResultForTrainee`) and starting a new
     attempt (`startAttempt`, via `isQuizUnlocked`) were already
     sector-scoped this way. The actual gap was on the write side:
     `saveAnswers` and `submitAttempt` checked ownership (`userId`) but not
     the trainee's *current* sector, so a trainee reassigned away from a
     quiz's sector could still mutate an attempt on it even though reading
     it was already denied — fixed via a shared
     `assertTraineeSectorMatchesQuiz` check (added to
     `src/lib/quiz/attempt-lifecycle.ts`, called from both), and made
     explicit rather than an implicit side effect of a later outcome read
     in `getAttemptForTrainee`. Regression test:
     `src/lib/quiz/sector-reassignment.test.ts` (attempt 1 used → reassign
     away → confirm inaccessible for reads and writes → reassign back →
     confirm exact 1-of-2 state restored). No schema/persistence change was
     needed: attempt rows were never sector-filtered at the query level, so
     restoring access on reassignment-back was already automatic once the
     write-side gap closed.
   - Two edges explicitly NOT decided — recorded as open, not guessed at:
     - **(a) Does an already-earned certificate from the old sector stay
       valid/visible after reassignment?** Current incidental behavior,
       not a decision: a trainee's own certificate page
       (`src/app/(trainee)/certificate/page.tsx`) is scoped to their
       *current* sector only (`certificate.findUnique({ userId_sectorId })`),
       so an old certificate becomes invisible there after reassignment —
       the row itself is never deleted, and its direct link plus the
       public verify endpoint remain reachable regardless of sector, since
       neither is sector-gated.
     - **(b) What happens to an attempt that's
       in-progress-but-unsubmitted at the exact moment of reassignment?**
       Checked, not assumed: **confirmed reachable, not moot** —
       `src/lib/admin/assign-sector.ts`'s reassignment write has zero
       interaction with the `Attempt` table, so an Admin can reassign a
       trainee mid-quiz at any real moment, `IN_PROGRESS` or not. Current
       incidental behavior after this session's fix, not a decision: that
       attempt becomes immediately inaccessible for both reads and writes
       (the trainee's countdown effectively freezes from their side —
       save/submit calls start failing with `ForbiddenError`), but it is
       **not** force-finalized; it stays `IN_PROGRESS` until its natural
       `expiresAt` passes and something next reads it in a sector-matching
       context (e.g. after being reassigned back). Whether it *should* be
       force-submitted, invalidated, or something else at the moment of
       reassignment is undecided.
3. **RESOLVED 2026-07-22 — decided by Faris (project owner) directly, not
   by Ibrahim's confirmation.** The proposal below was originally drafted
   awaiting a yes/no from Ibrahim; the owner made the final call instead.
   Recorded accurately: this is an owner decision, not Ibrahim having
   agreed to it. Re-read the actual code fresh before drafting the
   original proposal, not assumed:

   `isQuizUnlocked` (`src/lib/content/quiz-unlock.ts`) and
   `markLessonComplete` (`src/lib/content/lesson-completion.ts`) both live
   in the testing engine's codebase today. What "lesson complete" means is
   a single `LessonCompletion` row keyed by `(userId, lessonId)` — nothing
   content-specific (no video-watch-percentage, no article-scroll state).
   It's created by a trainee tapping a manual "mark complete" button in the
   trainee UI (`CompleteLessonButton`), fully decoupled from whatever
   `Lesson` actually contains. `Lesson` is still FR-12's title-only
   placeholder, and the richer "watch video + read text" journey (FR-11)
   that would define a real content-driven completion signal is Not
   Started — so this data's *source* could plausibly change once Ibrahim's
   content system builds that journey (e.g. an auto-derived signal instead
   of today's manual button). That doesn't change where the *check* needs
   to live, though: `isQuizUnlocked` only depends on the `LessonCompletion`
   row existing, never on how or where it got created. Nothing about how
   it's written would make it hard to relocate later either, if that's
   ever needed — it's a small, self-contained read (a few Prisma queries
   against shared models, no side effects, no hidden coupling to the rest
   of the testing engine).

   **Resolution:** `isQuizUnlocked`/`markLessonComplete` stay in the
   testing engine's codebase, as proposed. Rationale, briefly: the unlock
   check only depends on a `LessonCompletion` row existing, not on how or
   where it's created, so it's decoupled from lesson content and cheap to
   relocate later if that's ever needed — no reason to move it now.

   No code changes were needed either way — this was a documentation
   decision only.
3b. **RESOLVED 2026-07-22 — folded into item #1 above**, which records the
    actual rule (chapter/topic-chain-scoped sequential ordering — neither
    single-lesson-only nor whole-sector-ordered). Kept as its own entry
    only so the existing `TODO(open-item-3, open-item-3b)` reference
    (`src/lib/content/quiz-unlock.ts`) still resolves to something; no
    separate text to add here.
4. **RESOLVED 2026-07-22 — the CEO's direction, recorded here verbatim:**
   there is no manual grading. Every non-auto-graded item is graded
   automatically, routed by type:
   - **Deterministic comparison** for simulation action-logs — no AI call
     needed, when the trainee's click/step sequence is captured
     structurally (i.e. compared against an expected action sequence, not
     interpreted).
   - **Gemini (native video input)** for anything genuinely video-based.
   - **AI-based grading** for open text/voice responses.

   This replaces the old "partial credit vs. binary, Admin's judgment"
   framing entirely — the question is no longer what an Admin decides, it's
   which automatic grading method a given item type uses. `TODO(open-item-4)`
   at `src/lib/grading/grading.ts` and `src/lib/quiz/attempt-lifecycle.ts`
   still marks the exact plug-in points; they haven't been touched yet, and
   the existing manual-grading queue (T-18/T-25) still exists and works
   as-is until this is implemented — this is a documentation update, not a
   code change.

   **This decision does NOT unblock implementation yet.** Still open, and
   nothing below should be guessed at: sandbox vs. live product for the new
   AI-grading calls, consent/retention rules for voice/video trainee
   submissions, cost, and a Gemini API key/budget (parallel to the existing
   `ANTHROPIC_API_KEY` block on slice 5b). Do not start building the
   grading pipeline, the Gemini integration, or the action-simulation
   engine until those are answered. See also "Handoff to Ibrahim's track"
   below — this decision creates new dependencies on the content system
   that need his track's input, not a guess from this one.
5. **ON HOLD 2026-07-22 — deliberately deferred, not pending an answer.**
   Notification rules (triggers, channels, wording). The owner's words:
   "not crucial for the platform to work right now." Distinct from every
   other item in this list: this isn't waiting on a decision, it's been
   explicitly deprioritized. Revisit only if the owner raises it again.
6. **OUT OF SCOPE for this track, 2026-07-22 — assigned to Ibrahim's
   track/session by the owner.** FR-26 (Call Library & Evaluation) was
   flagged for a change in an earlier meeting with no detail captured;
   the owner has since assigned it to Ibrahim's track. See "Handoff to
   Ibrahim's track" below — no longer carried as an open item on this
   track.
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

## Handoff to Ibrahim's track — new content dependencies (flagged 2026-07-22)

The resolved open item #4 above introduces new question/task types —
**voice-prompt** and **action-simulation** — on top of the existing bank.
This creates dependencies on the content system (his track) that this
session is stating as open questions, not deciding on his behalf:

- **Content grounding is currently zero.** Verified directly this session:
  the AI question-drafting prompt (`src/lib/ai/drafter.ts`,
  `DraftPromptInput`) only ever receives `lessonTitle`, `unitName`, and
  `skillType` — never any lesson content itself. That's not a drafting-code
  gap; the `Lesson` model in `prisma/schema.prisma` has no content field at
  all (`id`, `title`, `unitId` — nothing else), confirming FR-12's existing
  note that `Lesson` is a title-only placeholder pending his content
  system. Every AI-drafted question today is generated from a title
  string, not real lesson material, because there's no real lesson
  material to ground it in yet.
- **Action-simulation makes this more acute, not just more of the same.**
  A content-driven hotspot simulation (trainee clicks through a sequence
  against a captured UI) needs structured access to lesson screenshots or
  other content assets — specific images/screens plus per-hotspot
  target/coordinate data to check the trainee's action log against. There
  is no home for that in the schema today, and this session isn't
  proposing one — a `prisma/schema.prisma` proposal for the new
  `QuestionType` values and their grading-side fields (rubric, expected
  action sequence) was drafted and shared with Faris for review this
  session (not applied — standing rule to stop before touching that file),
  and it deliberately leaves source-asset storage out for exactly this
  reason.
- **The open question for his track, stated plainly, not guessed at:**
  where does structured asset content (screenshots, hotspot maps, and —
  separately — the real lesson text/video that question-drafting should
  ground in) live, and how does his authoring system produce/store it?
  This engine's schema can add fields to `Question` for the *grading* side
  (rubric, expected action sequence), but it has no answer for where the
  *source* content those reference actually comes from. That's squarely
  FR-18/T-36 territory, his track's call.

**Update 2026-07-22 — ownership confirmed, shape still open:** Ibrahim
confirmed content uploading and management — the source lesson content,
screenshots, and any assets this engine would eventually ground
question-drafting or action-simulation hotspots in — is his track's
responsibility, done via the Admin role/interface. This resolves the
*ownership* half of the open question above. It does **not** resolve the
*technical shape*: what the content model looks like, how assets are
structured, how hotspot/screenshot data would be exposed for a simulation
to reference. That design is still his track's call — this session isn't
guessing at it or proposing a schema for it.

Concrete downstream dependency this creates for the testing engine, on
record: once his track builds this, two things in this session's scope
become unblocked — (1) grounding AI-drafted questions in real lesson
content instead of just a title string (the gap confirmed in this
session's earlier content-grounding finding, above), and (2) sourcing
screenshot/hotspot assets for the content-driven action-simulation grading
path. Neither is buildable on this side until his content system exists;
not started here.

**Update 2026-07-22 — FR-26 (Call Library & Evaluation) assigned here by
the owner.** Previously open item #6 on this track; no longer is (see
Open items above). No detail on scope/requirements has been captured yet
— this is a pointer, not a spec.

**Update 2026-07-22 — item #1's chapter/topic-chain resolution touches his
content model too, flagged not guessed at:** this session's investigation
(held for Faris's review, not yet actioned) found `Unit` is the closest
existing match for "chapter/topic chain" — corroborated by FR-09's own
language ("subcategories: First Call, ...") and the seed fixture's exact
naming match — but FR-09 itself says the real path/subcategory structure
belongs to his content system, and `Lesson` has no explicit ordering field
today (only implicit `createdAt`, and every seeded `Unit` currently holds
exactly one lesson, so real multi-lesson sequencing has never been
exercised). If his content system's real hierarchy ends up shaped
differently than today's collapsed `Unit` stand-in, or needs an explicit
lesson-order field, that's a coordination point between the two tracks
when this gets built — not decided or acted on here. **Update, same
day — since resolved by Ibrahim's own response below**: the redo-loop and
chain-ordering unlock check have since been implemented using `Unit` +
`createdAt` ordering exactly as flagged here, unblocked by the ownership
answer he gave; still flagged as a stand-in pending a real ordering field,
per his own note on the content-model shape below.

## Handoff to testing-engine track (Ibrahim's response, 2026-07-22)

Read this file, HANDOFF.md (including Addendum 5), and `docs/fr-to-code.md`
in full before responding. Two things addressed directly, per instruction:

**Open item #3 (lesson-unlock ownership) — my answer: yes, confirmed.**
`isQuizUnlocked`/`markLessonComplete` should stay in the testing engine's
codebase. Same reasoning your proposal gave: the unlock check only depends
on a `LessonCompletion(userId, lessonId)` row existing, not on how or where
it's produced, so it's already decoupled from whatever the content model
ends up looking like. When FR-11's real "watch video + read text" journey
lands, "lesson complete" may stop being a manual button and become an
auto-derived signal (video-watch %, article scroll depth) — but that only
changes what *writes* the `LessonCompletion` row, not where the *read*
check lives. I'll treat that write-side contract (the row shape, the
`(userId, lessonId)` unique key) as something not to break without telling
you first, same as the shared-files discipline in HANDOFF.md.

One process note, not a substance objection: I found
`origin/claude/testing-open-item-3-owner-decision` (unmerged, pushed
today) already contains a commit recording that Faris decided this same
question directly — "owner decision, not Ibrahim's confirmation." My
answer above was reached independently (re-read the code fresh, same as
your proposal asked) and lands on the same resolution, so there's no
actual conflict to reconcile. Flagging it only because a proposal
addressed to me got an owner decision before I saw it — worth Faris/you
knowing that happened, not something I'm asking to relitigate. That branch
should just merge; nothing here should block it.

**Handoff to Ibrahim's track — content model shape.** Ownership was
already confirmed (2026-07-22, recorded above). This session is where the
technical shape design *starts* — nothing is decided yet, so treat
everything below as direction, not a spec:

- Scope I'm taking on: FR-11 (real lesson journey), FR-12 (Admin content
  upload/management), FR-18 (taxonomy CUD, currently deferred/read-only on
  your side), and T-36 (content-level versioning, mirroring your
  `QuestionRevision` pattern). `Lesson` stays your read dependency
  (`unitId`, quiz relation) — I'll extend it, not replace its identity.
- Direction I'm leaning toward, not committed: a versioned content-block
  model attached to `Lesson` (video/PDF/article/image blocks, ordered),
  plus a structured asset table for anything a future hotspot simulation
  would need to reference (image + per-hotspot coordinate/target data) —
  shaped so your grading-side `Question` fields (rubric, expected action
  sequence) can point at a stable asset ID instead of duplicating asset
  data. I have not written a schema. Any real proposal touches
  `prisma/schema.prisma`, which per this session's standing rule gets a
  direct check-in with Ibrahim (the human) before it's touched, regardless
  of which track's work motivates it.
- Open question back to you, so my shape doesn't miss your actual needs:
  when you eventually ground AI-drafted questions in real lesson content,
  what form does the drafter need that content in — full rich text/HTML,
  a plain-text extract, section-level chunks? And for action-simulation
  hotspot grounding, do you need anything beyond "an image plus a list of
  {x, y, label} target regions," or is there DOM/coordinate-system context
  from how the simulation is captured that the asset model should also
  carry? Answering either now would shape the schema proposal I bring you;
  no rush if these aren't decided on your side yet either.
- Timeline honestly: no ETA committed this response — this is the start of
  design, not a delivery date. I'll update this section again once a
  concrete schema proposal exists, same pattern you used for your
  drafted-not-applied `QuestionType` proposal.

**Update 2026-07-22 (same session) — schema applied, not just proposed.**
Ibrahim reviewed the direction above and confirmed two design choices (a
DRAFT/PUBLISHED gate on content items, and per-item rather than per-lesson
versioning), so `prisma/schema.prisma` now has three new models:
`ContentItem` (ordered VIDEO/PDF/ARTICLE/IMAGE blocks on `Lesson`),
`ContentItemRevision` (T-36, same append-only-snapshot shape as your
`QuestionRevision`), and `ContentAsset` (uploaded binaries — `url` kept
storage-backend-agnostic; the actual backend, S3/Vercel Blob/local, is
still undecided by choice, not an oversight). `Lesson`'s identity/read
surface for your track is untouched — only a new `contentItems` relation
was added, nothing existing renamed or removed. `ContentAsset.hotspots`
(the provisional `{id, x, y, width, height, label}` shape from my question
above) is still just a placeholder `Json?` — not confirmed with you, don't
build against its shape yet.

Migration `prisma/migrations/20260722120000_lesson_content_model` was
initially hand-authored (no live Postgres reachable yet at that point in
the session), then genuinely verified once DB access was sorted out later
the same session: applied via `prisma migrate deploy` to a completely
fresh database (all 10 migrations, in order, including the testing
engine's own `attempt_cap_override` from the same backlog), confirmed
zero-drift against `prisma/schema.prisma` (`migrate status` →
"Database schema is up to date"), and the **full existing test suite (36
files, 171 tests) passes against it, no failures, nothing skipped**. Not
guessed at — actually run.

No admin or trainee UI built yet — that's next.

**Update 2026-07-22 (same session) — admin content-management UI shipped
(FR-12).** `/admin/content` (taxonomy tree → lesson → content items) now
supports create/edit/publish/unpublish/reorder for VIDEO/PDF/ARTICLE/IMAGE
items, plus revision history + restore (T-36) — full CRUD on top of the
schema above, on branch `claude/lms-content-admin-ui` (stacked on this
branch, not yet merged to `main`). VIDEO/PDF/IMAGE items upload to local
disk (`src/lib/content/upload-asset.ts`) — still explicitly dev-only, the
real storage backend is still your open question to answer, not decided
here. 34 new tests; full suite 40 files/205 tests passing.

Manually verified end-to-end in a real browser (forged an admin session —
no OAuth creds available locally): create → publish → edit → revision
history → restore, walked live, not just unit-tested. That walkthrough
found a real bug (fixed): restoring a revision updated the database
correctly but the edit form kept showing the pre-restore content until a
hard reload, since `router.refresh()` re-renders server data without
remounting an already-initialized client component's local state — a
follow-up save without noticing would have silently re-clobbered the
restore. Fixed by keying the form on the item's `updatedAt`.

**One finding worth flagging to your track specifically, not just a note
to self:** uploaded `ContentAsset` URLs (`/uploads/content-assets/...`) are
gated by the app's auth middleware — any authenticated session can fetch
one, the same as every other route — but they are **not sector-scoped**.
A trainee assigned to one sector could fetch another sector's asset URL
directly if they knew (or guessed) its id. This has an exact precedent
already in the codebase (certificate PDFs and their public verify link
aren't sector-gated either), so it's not a new category of gap, but it's
worth deciding deliberately rather than inheriting silently — especially
since your track's action-simulation hotspot grounding would reference
these same assets. Not fixed here: FR-11's trainee-facing content view
doesn't exist yet, so nothing actually serves these URLs to a trainee
today; revisit when it does.

## Known fragilities

Not CEO decisions — internal engineering caveats worth grepping for before
touching the related code.

- `TODO(ownership-audit-1)` (`src/lib/quiz/attempt-lifecycle.ts`, both
  `finalizeAttempt` and `syncExpiry`): these trust `attemptId` unconditionally
  and have no ownership check of their own. No live bug — every current call
  site already passes an attemptId that was pre-verified as belonging to the
  caller — but a future route calling either directly with a client-supplied
  attemptId would have no independent safeguard against acting on another
  trainee's attempt. (`getAttemptForTrainee` in `src/lib/quiz/attempt-view.ts`
  is the precedent: ownership check first, then `syncExpiry`.)
- **Answer-key redaction boundary:** `AttemptAnswer` rows snapshot
  `correctOption`. Raw rows must NEVER be serialized to a trainee-facing
  boundary — not in a route response and not as an RSC page prop (props
  reach the client). Every trainee-facing attempt read goes through
  `toTraineeAttemptView` (`src/lib/quiz/attempt-view.ts`), which omits
  `correctOption` unconditionally and hides `isCorrect`/`feedback` while
  IN_PROGRESS. Slice 9 fixed a live mid-attempt leak in the save-answers
  response caused by skipping this.

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
