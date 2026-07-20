import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/rbac";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit/log";
import { MANUALLY_GRADED_TYPES } from "@/lib/questions/question-types";

// T-25: Admin views submitted scenario/free-text/mock-call answers still
// awaiting a grade. Global across trainees — Admin isn't sector-scoped
// (Roles table, CLAUDE.md).
export async function listPendingGrading(session: Session | null) {
  requireRole(session, ["ADMIN"]);

  return prisma.attemptAnswer.findMany({
    where: {
      isCorrect: null,
      questionType: { in: MANUALLY_GRADED_TYPES },
      attempt: { status: "PENDING_MANUAL_GRADE" },
    },
    include: {
      attempt: {
        select: {
          id: true,
          quizId: true,
          submittedAt: true,
          user: { select: { id: true, name: true, email: true } },
          quiz: { select: { id: true, title: true } },
        },
      },
    },
    orderBy: { attempt: { submittedAt: "asc" } },
  });
}

// T-25: enter a grade with written feedback, per answer. Deliberately does
// NOT touch Attempt.score/passed — see the TODO(open-item-4) below and
// finalizeAttempt's comment in attempt-lifecycle.ts for why.
export async function gradeAnswer(
  session: Session | null,
  attemptAnswerId: string,
  isCorrect: boolean,
  feedback: string,
) {
  requireRole(session, ["ADMIN"]);

  const answer = await prisma.attemptAnswer.findUnique({
    where: { id: attemptAnswerId },
    include: { attempt: true },
  });
  if (!answer) throw new NotFoundError("Answer not found");
  if (!MANUALLY_GRADED_TYPES.includes(answer.questionType)) {
    throw new ForbiddenError("This answer is auto-graded and cannot be manually graded");
  }
  if (answer.attempt.status !== "PENDING_MANUAL_GRADE") {
    throw new ForbiddenError(`Attempt is not awaiting manual grading (status: ${answer.attempt.status})`);
  }

  const updated = await prisma.attemptAnswer.update({
    where: { id: attemptAnswerId },
    data: { isCorrect, feedback, gradedById: session.user.id, gradedAt: new Date() },
  });

  await recordAudit(session.user.id, "answer_graded", "AttemptAnswer", attemptAnswerId, {
    attemptId: answer.attemptId,
    isCorrect,
  });

  // TODO(open-item-4): this records the per-item grade only. Converting a
  // fully-graded attempt's item-level grades into an overall Attempt
  // score/passed (T-26) is intentionally not implemented — CLAUDE.md open
  // item #4 (does manual grading need to hit the same 95% bar, or is it
  // Admin judgment?) is unresolved. The Attempt stays PENDING_MANUAL_GRADE
  // with score/passed left null even once every answer has been graded,
  // until that's answered and someone wires the actual finalization rule
  // (likely a new function here, called once the last answer is graded).

  return updated;
}
