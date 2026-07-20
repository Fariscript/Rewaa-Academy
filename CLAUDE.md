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
- **AI drafts quiz questions.** A Trainer/Training Manager must approve,
  edit, or reject every single one before it can reach a trainee. This is a
  hard gate — no auto-publish path, no exceptions. (T-10, T-11, T-12, NFR-06)
- MCQ / true-false → auto-graded. Scenario / free-text / mock-call → routed
  to a Trainer for manual grading with written feedback. (T-17, T-18, T-25)
  ⚠️ Whether manual grading must also hit 95% is **unresolved** — see Open
  Items below. Don't hardcode an assumption.
- **Content items and question-bank items both support versioning**: edit
  history retained, prior versions viewable/restorable, without altering a
  trainee's already-completed records or scores. (FR-12, T-15, T-36, NFR-13)
- Identity: **Google Workspace SSO only**, restricted to the company domain.
  No separate password auth for this platform. (FR-02, FR-03, T-27)
- **Arabic-only UI.** (NFR-09)
- Manager dashboard is **basic in Phase 1 on purpose**: who's completed a
  quiz, who hasn't, who's on attempt 2, average scores, a flag for anyone
  who failed both attempts. Do not build deeper analytics/trends early —
  that's explicitly Phase 2. (T-21–T-24)

## Roles

| Role | Can do |
|---|---|
| Trainee | Sector-scoped content + quizzes only; sees own attempts/scores; downloads own certificate |
| Trainer / Training Manager | Approves question bank; grades manual submissions; views testing dashboard |
| Admin | Manages taxonomy (sectors/sub-sectors/paths); assigns/reassigns trainees to sectors; can override attempts |

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
4. Does manual grading need to hit the same 95% bar, or is it trainer
   judgment?
5. Notification rules (triggers, channels, wording) — not yet defined.
6. FR-26 (Call Library & Evaluation) — flagged for a change in the latest
   meeting, but no detail was captured yet.

These are exactly the decisions that cause expensive rebuilds if guessed
wrong. If a task depends on one, implement everything around it and leave
the decision point clearly marked (e.g. a single config value or a TODO
with the open-item number) rather than picking an assumption silently.

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
