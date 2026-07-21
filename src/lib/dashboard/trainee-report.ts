import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/rbac";
import { NotFoundError } from "@/lib/errors";
import { DEFAULT_MAX_ATTEMPTS } from "@/lib/admin/attempt-override";
import { syncExpiry } from "@/lib/quiz/attempt-lifecycle";
import { computeQuizOutcome, type QuizOutcome } from "@/lib/quiz/outcome";

export interface TraineeReportQuizRow {
  quizId: string;
  quizTitle: string;
  lessonTitle: string;
  unitName: string;
  outcome: QuizOutcome;
  lastActivityAt: Date | null;
}

export interface TraineeReport {
  trainee: { id: string; name: string | null; email: string; sector: { id: string; name: string } | null };
  certificateIssuedAt: Date | null;
  totals: {
    lessonsCompleted: number;
    totalLessons: number;
    quizzesPassed: number;
    totalQuizzes: number;
    averageBestScore: number | null;
  };
  quizzes: TraineeReportQuizRow[];
}

// T-24 (Phase 2): the per-trainee performance report — one trainee across
// their whole assigned sector. Same batched read shape as
// getMyLearningHome, but admin-facing and summarized. Reads only.
export async function getTraineeReport(session: Session | null, traineeId: string): Promise<TraineeReport> {
  requireRole(session, ["ADMIN"]);

  const trainee = await prisma.user.findUnique({
    where: { id: traineeId },
    select: { id: true, name: true, email: true, role: true, sector: { select: { id: true, name: true } } },
  });
  if (!trainee || trainee.role !== "TRAINEE") throw new NotFoundError("Trainee not found");

  const base: TraineeReport = {
    trainee: { id: trainee.id, name: trainee.name, email: trainee.email, sector: trainee.sector },
    certificateIssuedAt: null,
    totals: { lessonsCompleted: 0, totalLessons: 0, quizzesPassed: 0, totalQuizzes: 0, averageBestScore: null },
    quizzes: [],
  };
  if (!trainee.sector) return base;

  const [lessons, certificate] = await Promise.all([
    prisma.lesson.findMany({
      where: { unit: { subSector: { sectorId: trainee.sector.id } } },
      select: { id: true, title: true, unit: { select: { name: true } }, quiz: true },
    }),
    prisma.certificate.findUnique({
      where: { userId_sectorId: { userId: trainee.id, sectorId: trainee.sector.id } },
      select: { issuedAt: true },
    }),
  ]);
  const quizzes = lessons.filter((l) => l.quiz !== null);
  const quizIds = quizzes.map((l) => l.quiz!.id);

  const [completions, attempts, overrides] = await Promise.all([
    prisma.lessonCompletion.findMany({
      where: { userId: trainee.id, lessonId: { in: lessons.map((l) => l.id) } },
      select: { lessonId: true },
    }),
    prisma.attempt.findMany({ where: { userId: trainee.id, quizId: { in: quizIds } } }),
    prisma.attemptCapOverride.groupBy({
      by: ["quizId"],
      where: { userId: trainee.id, quizId: { in: quizIds } },
      _sum: { extraAttempts: true },
    }),
  ]);

  const expired = await Promise.all(
    attempts.filter((a) => a.status === "IN_PROGRESS").map((a) => syncExpiry(a.id)),
  );
  const syncedById = new Map(expired.map((a) => [a.id, a]));
  const extraByQuizId = new Map(overrides.map((o) => [o.quizId, o._sum.extraAttempts ?? 0]));

  const rows: TraineeReportQuizRow[] = quizzes.map((lesson) => {
    const quiz = lesson.quiz!;
    const mine = attempts.filter((a) => a.quizId === quiz.id).map((a) => syncedById.get(a.id) ?? a);
    const outcome = computeQuizOutcome(mine, DEFAULT_MAX_ATTEMPTS + (extraByQuizId.get(quiz.id) ?? 0));
    const activityDates = mine.flatMap((a) => [a.startedAt, a.submittedAt]).filter((d): d is Date => d !== null);
    return {
      quizId: quiz.id,
      quizTitle: quiz.title,
      lessonTitle: lesson.title,
      unitName: lesson.unit.name,
      outcome,
      lastActivityAt:
        activityDates.length > 0 ? new Date(Math.max(...activityDates.map((d) => d.getTime()))) : null,
    };
  });

  const scored = rows.filter((r) => r.outcome.bestScore !== null);
  return {
    ...base,
    certificateIssuedAt: certificate?.issuedAt ?? null,
    totals: {
      lessonsCompleted: completions.length,
      totalLessons: lessons.length,
      quizzesPassed: rows.filter((r) => r.outcome.passed).length,
      totalQuizzes: rows.length,
      averageBestScore:
        scored.length > 0
          ? scored.reduce((sum, r) => sum + (r.outcome.bestScore as number), 0) / scored.length
          : null,
    },
    quizzes: rows,
  };
}
