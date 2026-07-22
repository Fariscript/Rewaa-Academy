import { prisma } from "@/lib/prisma";
import { scoreAnswers } from "./scoring";
import { isAutoGraded } from "@/lib/questions/question-types";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

// Open item #2 (RESOLVED 2026-07-22, see CLAUDE.md): progress in a sector a
// trainee is no longer assigned to is never deleted, but stays inaccessible
// until they're reassigned back. getQuizOutcome (src/lib/quiz/outcome.ts)
// already makes reads sector-scoped this way; this is the same check
// factored out for callers that mutate an attempt directly (save/submit)
// rather than going through an outcome read. Attempt rows themselves are
// never sector-filtered at the query level (see start-attempt.ts) — cap
// consumption and history are restored automatically, in full, once the
// sector matches again, purely because nothing here ever deletes them.
export async function assertTraineeSectorMatchesQuiz(userId: string, quizId: string) {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { lesson: { select: { unit: { select: { subSector: { select: { sectorId: true } } } } } } },
  });
  if (!quiz) throw new NotFoundError("Quiz not found");

  const trainee = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { sectorId: true },
  });
  if (!trainee.sectorId || trainee.sectorId !== quiz.lesson.unit.subSector.sectorId) {
    throw new ForbiddenError("Quiz is outside your assigned sector");
  }
}

// TODO(ownership-audit-1): this function trusts attemptId unconditionally —
// it has no session/ownership check of its own. Every current call site
// (start-attempt.ts, save-answers.ts, submit-attempt.ts, outcome.ts) only
// ever passes an attemptId that the caller already verified belongs to the
// requesting user (or that came from a userId-filtered query), so there is
// no live bug today. But if a future route ever calls this directly with a
// client-supplied attemptId, nothing here would stop it acting on someone
// else's attempt. Add an explicit ownership check here, or keep this
// comment enforced by never calling it directly from a route.
//
// Finalizes an attempt (SUBMITTED via explicit submit, or AUTO_SUBMITTED via
// syncExpiry below) by scoring whatever answers were saved. Idempotent: an
// already-finalized attempt's row is left untouched rather than re-scored.
//
// T-18: an attempt containing any SCENARIO/FREE_TEXT/MOCK_CALL answer is
// routed to PENDING_MANUAL_GRADE instead — score/passed stay null. This is
// a hard stop, not a placeholder: CLAUDE.md open item #4 (does manual
// grading need to hit the same 95% bar, or is it Admin judgment?) is
// unresolved, so there is no rule anywhere in this codebase for combining
// manual grades into an overall score. See src/lib/grading/ for what *is*
// built (routing + per-item grade capture) and what deliberately isn't
// (finalization).
export async function finalizeAttempt(attemptId: string, status: "SUBMITTED" | "AUTO_SUBMITTED") {
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.attempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: { answers: true },
    });
    if (attempt.status !== "IN_PROGRESS") return attempt;

    const autoGraded = attempt.answers.filter((a) => isAutoGraded(a.questionType));
    const needsManualGrading = autoGraded.length < attempt.answers.length;

    // Auto-graded answers get their correctness computed immediately
    // regardless of whether other answers in the same attempt need manual
    // grading — that judgment doesn't depend on open item #4.
    await Promise.all(
      autoGraded.map((answer) =>
        tx.attemptAnswer.update({
          where: { id: answer.id },
          data: { isCorrect: answer.selectedOption !== null && answer.selectedOption === answer.correctOption },
        }),
      ),
    );

    if (needsManualGrading) {
      return tx.attempt.update({
        where: { id: attemptId },
        data: { status: "PENDING_MANUAL_GRADE", submittedAt: new Date() },
        include: { answers: true },
      });
    }

    const result = scoreAnswers(autoGraded);
    return tx.attempt.update({
      where: { id: attemptId },
      data: { status, submittedAt: new Date(), score: result.score, passed: result.passed },
      include: { answers: true },
    });
  });
}

// TODO(ownership-audit-1): same caveat as finalizeAttempt above — trusts
// attemptId unconditionally, depends on callers having already
// ownership-checked it. No live bug today (see that function's comment for
// the full reasoning); flagging here too since this is an independent
// entry point into the same trust assumption.
//
// T-32: auto-submit "whatever answers were saved" when time expires. There's
// no background scheduler in Phase 1 — expiry is instead checked lazily on
// every access to an attempt (starting a new attempt, saving answers,
// submitting, reading outcome), so an attempt can never be silently stuck
// IN_PROGRESS past its deadline no matter which of those a trainee hits next.
export async function syncExpiry(attemptId: string) {
  const attempt = await prisma.attempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: { quiz: true },
  });
  if (attempt.status !== "IN_PROGRESS") return attempt;

  const deadline = attempt.startedAt.getTime() + attempt.quiz.timeLimitSeconds * 1000;
  if (Date.now() <= deadline) return attempt;

  await finalizeAttempt(attemptId, "AUTO_SUBMITTED");
  return prisma.attempt.findUniqueOrThrow({ where: { id: attemptId }, include: { quiz: true } });
}
