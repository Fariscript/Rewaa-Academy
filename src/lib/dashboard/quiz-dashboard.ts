import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/rbac";
import { NotFoundError } from "@/lib/errors";
import { getAllowedAttempts } from "@/lib/admin/attempt-override";
import { syncExpiry } from "@/lib/quiz/attempt-lifecycle";
import { computeQuizOutcome, type QuizOutcome } from "@/lib/quiz/outcome";

export interface QuizDashboardRow extends QuizOutcome {
  trainee: { id: string; name: string | null; email: string };
  onAttempt2: boolean;
}

export interface QuizDashboard {
  quizId: string;
  quizTitle: string;
  trainees: QuizDashboardRow[];
  summary: {
    totalTrainees: number;
    notStarted: number;
    inProgress: number;
    awaitingManualGrade: number;
    passed: number;
    failedBothAttempts: number;
    onAttempt2: number;
    averageScore: number | null;
  };
}

// T-21/T-22/T-23: basic Phase 1 dashboard, deliberately not more (CLAUDE.md
// "Dashboard is a single Admin-only view... still basic in Phase 1 on
// purpose"). One quiz at a time, scoped to the trainees assigned to that
// quiz's sector — Admin itself isn't sector-scoped, but the trainees a
// quiz is relevant to are.
export async function getQuizDashboard(session: Session | null, quizId: string): Promise<QuizDashboard> {
  requireRole(session, ["ADMIN"]);

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: {
      title: true,
      lesson: { select: { unit: { select: { subSector: { select: { sectorId: true } } } } } },
    },
  });
  if (!quiz) throw new NotFoundError("Quiz not found");

  const sectorId = quiz.lesson.unit.subSector.sectorId;
  const trainees = await prisma.user.findMany({
    where: { sectorId, role: "TRAINEE" },
    select: { id: true, name: true, email: true },
    orderBy: { email: "asc" },
  });

  const rows: QuizDashboardRow[] = await Promise.all(
    trainees.map(async (trainee) => {
      const attempts = await prisma.attempt.findMany({ where: { userId: trainee.id, quizId } });
      const synced = await Promise.all(attempts.map((a) => syncExpiry(a.id)));
      const attemptsAllowed = await getAllowedAttempts(trainee.id, quizId);
      const outcome = computeQuizOutcome(synced, attemptsAllowed);
      const onAttempt2 = synced.some((a) => a.attemptNumber === 2);
      return { trainee, onAttempt2, ...outcome };
    }),
  );

  const scored = rows.filter((r) => r.bestScore !== null);
  const averageScore =
    scored.length > 0 ? scored.reduce((sum, r) => sum + (r.bestScore as number), 0) / scored.length : null;

  return {
    quizId,
    quizTitle: quiz.title,
    trainees: rows,
    summary: {
      totalTrainees: rows.length,
      notStarted: rows.filter((r) => r.status === "NOT_STARTED").length,
      inProgress: rows.filter((r) => r.status === "IN_PROGRESS").length,
      awaitingManualGrade: rows.filter((r) => r.status === "AWAITING_MANUAL_GRADE").length,
      passed: rows.filter((r) => r.status === "PASSED").length,
      failedBothAttempts: rows.filter((r) => r.status === "FAILED_FINAL_ATTEMPT").length,
      onAttempt2: rows.filter((r) => r.onAttempt2).length,
      averageScore,
    },
  };
}
