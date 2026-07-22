import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/rbac";
import { NotFoundError } from "@/lib/errors";
import { DEFAULT_MAX_ATTEMPTS } from "@/lib/admin/attempt-override";
import { syncExpiry } from "@/lib/quiz/attempt-lifecycle";
import { computeQuizOutcome, type QuizOutcome } from "@/lib/quiz/outcome";

export interface QuizDashboardRow extends QuizOutcome {
  trainee: { id: string; name: string | null; email: string };
  onAttempt2: boolean;
  // Open item #1 (RESOLVED 2026-07-22, see CLAUDE.md): permanent record —
  // deliberately NOT collapsed with `status`/`failedBothAttempts` below,
  // which are point-in-time and flip back once the trainee breaks out of
  // the redo-loop. This stays true forever once set, even after PASSED.
  everFailed: boolean;
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
    // Point-in-time: currently FAILED_FINAL_ATTEMPT, right now. Clears the
    // moment a trainee redoes the lesson and gets a fresh window (open
    // item #1) — distinct from `everFailed` below, which never clears.
    failedBothAttempts: number;
    everFailed: number;
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

  // Batched (NFR-08): one attempts read + one override aggregate for the
  // whole cohort instead of ~3 queries per trainee — measured ~1s at 300
  // trainees the per-trainee way, ~50ms batched. Lazy expiry (T-32) is
  // synced only for rows actually IN_PROGRESS; everything else is
  // immutable and needs no round-trip.
  const traineeIds = trainees.map((t) => t.id);
  const attempts = await prisma.attempt.findMany({ where: { quizId, userId: { in: traineeIds } } });
  const expired = await Promise.all(
    attempts.filter((a) => a.status === "IN_PROGRESS").map((a) => syncExpiry(a.id)),
  );
  const syncedById = new Map(expired.map((a) => [a.id, a]));
  const overrides = await prisma.attemptCapOverride.groupBy({
    by: ["userId"],
    where: { quizId, userId: { in: traineeIds } },
    _sum: { extraAttempts: true },
  });
  const extraByUserId = new Map(overrides.map((o) => [o.userId, o._sum.extraAttempts ?? 0]));

  // Batched, same discipline as the attempts/overrides reads above: one
  // query for the whole cohort's permanent failure records.
  const failureRecords = await prisma.quizFailureRecord.findMany({
    where: { quizId, userId: { in: traineeIds } },
    select: { userId: true },
  });
  const everFailedUserIds = new Set(failureRecords.map((r) => r.userId));

  const rows: QuizDashboardRow[] = trainees.map((trainee) => {
    const synced = attempts.filter((a) => a.userId === trainee.id).map((a) => syncedById.get(a.id) ?? a);
    const attemptsAllowed = DEFAULT_MAX_ATTEMPTS + (extraByUserId.get(trainee.id) ?? 0);
    const outcome = computeQuizOutcome(synced, attemptsAllowed);
    const onAttempt2 = synced.some((a) => a.attemptNumber === 2);
    const everFailed = everFailedUserIds.has(trainee.id);
    return { trainee, onAttempt2, everFailed, ...outcome };
  });

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
      everFailed: rows.filter((r) => r.everFailed).length,
      onAttempt2: rows.filter((r) => r.onAttempt2).length,
      averageScore,
    },
  };
}
