import { prisma } from "@/lib/prisma";
import { scoreAnswers } from "./scoring";

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
export async function finalizeAttempt(attemptId: string, status: "SUBMITTED" | "AUTO_SUBMITTED") {
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.attempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: { answers: true },
    });
    if (attempt.status !== "IN_PROGRESS") return attempt;

    const result = scoreAnswers(attempt.answers);

    await Promise.all(
      attempt.answers.map((answer) =>
        tx.attemptAnswer.update({
          where: { id: answer.id },
          data: { isCorrect: answer.selectedOption !== null && answer.selectedOption === answer.correctOption },
        }),
      ),
    );

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
