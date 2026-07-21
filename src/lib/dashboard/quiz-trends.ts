import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/rbac";
import { NotFoundError } from "@/lib/errors";

export interface WeeklyTrendRow {
  weekStart: Date;
  attempts: number;
  averageScore: number | null;
  passRate: number | null; // 0..1 across finalized attempts that week
}

export interface AttemptNumberRow {
  attemptNumber: number;
  attempts: number;
  averageScore: number | null;
  passRate: number | null;
}

export interface QuizTrends {
  quizId: string;
  quizTitle: string;
  weekly: WeeklyTrendRow[]; // oldest → newest, empty weeks included
  byAttemptNumber: AttemptNumberRow[];
}

const WEEK_MS = 7 * 24 * 3600 * 1000;

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  // ISO-ish week anchor: Monday.
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - day * 24 * 3600 * 1000);
}

// T-24 (Phase 2): training-level trends for one quiz — finalized attempts
// only (SUBMITTED/AUTO_SUBMITTED; pending-manual attempts have no score
// yet and are excluded, same rule as computeQuizOutcome). Aggregated in
// JS: cohort scale is hundreds of rows, not millions.
export async function getQuizTrends(session: Session | null, quizId: string, weeks = 8): Promise<QuizTrends> {
  requireRole(session, ["ADMIN"]);

  const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, select: { id: true, title: true } });
  if (!quiz) throw new NotFoundError("Quiz not found");

  const since = startOfWeek(new Date(Date.now() - (weeks - 1) * WEEK_MS));
  const attempts = await prisma.attempt.findMany({
    where: {
      quizId,
      status: { in: ["SUBMITTED", "AUTO_SUBMITTED"] },
      submittedAt: { gte: since },
    },
    select: { submittedAt: true, attemptNumber: true, score: true, passed: true },
  });

  const weekly: WeeklyTrendRow[] = [];
  for (let i = 0; i < weeks; i++) {
    const weekStart = new Date(since.getTime() + i * WEEK_MS);
    const weekEnd = new Date(weekStart.getTime() + WEEK_MS);
    const inWeek = attempts.filter((a) => a.submittedAt! >= weekStart && a.submittedAt! < weekEnd);
    const scored = inWeek.filter((a) => a.score !== null);
    weekly.push({
      weekStart,
      attempts: inWeek.length,
      averageScore: scored.length > 0 ? scored.reduce((s, a) => s + (a.score as number), 0) / scored.length : null,
      passRate: inWeek.length > 0 ? inWeek.filter((a) => a.passed === true).length / inWeek.length : null,
    });
  }

  const numbers = [...new Set(attempts.map((a) => a.attemptNumber))].sort((a, b) => a - b);
  const byAttemptNumber: AttemptNumberRow[] = numbers.map((n) => {
    const group = attempts.filter((a) => a.attemptNumber === n);
    const scored = group.filter((a) => a.score !== null);
    return {
      attemptNumber: n,
      attempts: group.length,
      averageScore: scored.length > 0 ? scored.reduce((s, a) => s + (a.score as number), 0) / scored.length : null,
      passRate: group.length > 0 ? group.filter((a) => a.passed === true).length / group.length : null,
    };
  });

  return { quizId, quizTitle: quiz.title, weekly, byAttemptNumber };
}
