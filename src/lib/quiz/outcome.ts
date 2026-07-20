import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { syncExpiry } from "./attempt-lifecycle";

export type QuizOutcomeStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "AWAITING_MANUAL_GRADE"
  | "PASSED"
  | "FAILED_FINAL_ATTEMPT";

export interface QuizOutcome {
  attemptsUsed: number;
  bestScore: number | null;
  passed: boolean;
  status: QuizOutcomeStatus;
}

// T-20: "highest score is the trainee's final result" — passed/bestScore
// are computed across ALL finalized (SUBMITTED/AUTO_SUBMITTED) attempts,
// not just the most recent one. PENDING_MANUAL_GRADE attempts (T-18) still
// consume an attempt slot but are deliberately excluded from the
// score/passed computation — they have no score yet, and CLAUDE.md open
// item #4 means there's no rule for what one would even mean here.
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

  const graded = synced.filter((a) => a.status === "SUBMITTED" || a.status === "AUTO_SUBMITTED");
  const hasPendingGrade = synced.some((a) => a.status === "PENDING_MANUAL_GRADE");
  const hasInProgress = synced.some((a) => a.status === "IN_PROGRESS");
  const attemptsUsed = synced.filter((a) => a.status !== "IN_PROGRESS").length;

  const bestScore = graded.length > 0 ? Math.max(...graded.map((a) => a.score ?? 0)) : null;
  const passed = graded.some((a) => a.passed === true);

  let status: QuizOutcomeStatus;
  if (passed) {
    status = "PASSED";
  } else if (hasPendingGrade) {
    // Not yet known whether this will end up passed or failed — don't
    // preempt that with FAILED_FINAL_ATTEMPT while grading is outstanding.
    status = "AWAITING_MANUAL_GRADE";
  } else if (attemptsUsed >= 2) {
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
  } else if (hasInProgress || attemptsUsed >= 1) {
    status = "IN_PROGRESS";
  } else {
    status = "NOT_STARTED";
  }

  return { attemptsUsed, bestScore, passed, status };
}
