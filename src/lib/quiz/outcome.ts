import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { syncExpiry } from "./attempt-lifecycle";

export type QuizOutcomeStatus = "NOT_STARTED" | "IN_PROGRESS" | "PASSED" | "FAILED_FINAL_ATTEMPT";

export interface QuizOutcome {
  attemptsUsed: number;
  bestScore: number | null;
  passed: boolean;
  status: QuizOutcomeStatus;
}

// T-20: "highest score is the trainee's final result" — passed/bestScore
// are computed across ALL finalized attempts, not just the most recent one.
export async function getQuizOutcome(session: Session | null, quizId: string): Promise<QuizOutcome> {
  if (!session?.user) throw new UnauthenticatedError();

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { lesson: { select: { unit: { select: { subSector: { select: { sectorId: true } } } } } } },
  });
  if (!quiz) throw new NotFoundError("Quiz not found");

  const caller = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { sectorId: true },
  });
  if (!caller.sectorId || caller.sectorId !== quiz.lesson.unit.subSector.sectorId) {
    throw new ForbiddenError("Quiz is outside your assigned sector");
  }

  const attempts = await prisma.attempt.findMany({ where: { userId: session.user.id, quizId } });
  const synced = await Promise.all(attempts.map((a) => syncExpiry(a.id)));

  const finalized = synced.filter((a) => a.status !== "IN_PROGRESS");
  const hasInProgress = synced.some((a) => a.status === "IN_PROGRESS");
  const bestScore = finalized.length > 0 ? Math.max(...finalized.map((a) => a.score ?? 0)) : null;
  const passed = finalized.some((a) => a.passed === true);

  let status: QuizOutcomeStatus;
  if (passed) {
    status = "PASSED";
  } else if (finalized.length >= 2) {
    // TODO(open-item-1): what happens after both attempts fail — blocked,
    // flagged for manual review, or something else — is still unresolved.
    // This status is purely informational today: it feeds T-23's dashboard
    // flag (slice 7) and nothing else branches on it. No block/
    // notification/review-queue logic exists anywhere in the codebase yet.
    // Whoever resolves open item #1 wires the actual consequence at
    // whatever call site needs it (e.g. a future gate in
    // src/lib/content/quiz-unlock.ts, a dashboard action, or a
    // notification trigger for open item #5) — not here.
    status = "FAILED_FINAL_ATTEMPT";
  } else if (hasInProgress || finalized.length >= 1) {
    status = "IN_PROGRESS";
  } else {
    status = "NOT_STARTED";
  }

  return { attemptsUsed: finalized.length, bestScore, passed, status };
}
