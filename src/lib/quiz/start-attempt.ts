import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { isQuizUnlocked } from "@/lib/content/quiz-unlock";
import { getAllowedAttempts } from "@/lib/admin/attempt-override";
import { syncExpiry } from "./attempt-lifecycle";

// T-7/T-33: the Start button — an attempt is created only on this explicit
// call, never by unlocking. T-3/T-20: capped at 2 attempts (the immutable
// DEFAULT_MAX_ATTEMPTS in src/lib/admin/attempt-override.ts) unless an
// Admin has explicitly granted this trainee extra attempts on this quiz;
// the cap is enforced unconditionally regardless of pass/fail (see
// src/lib/quiz/outcome.ts for the still-open question of what happens
// *after* both fail — that's a separate, stubbed concern from this cap).
export async function startAttempt(session: Session | null, quizId: string) {
  if (!session?.user) throw new UnauthenticatedError();

  // T-12/T-16: only approved questions are eligible to be served in a live
  // quiz — drafts, retired, and rejected questions never reach a trainee.
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: { questions: { where: { status: "APPROVED" } } },
  });
  if (!quiz) throw new NotFoundError("Quiz not found");
  if (quiz.questions.length === 0) {
    throw new ForbiddenError("Quiz has no approved questions yet");
  }

  const unlocked = await isQuizUnlocked(session, quizId); // also re-validates sector access
  if (!unlocked) throw new ForbiddenError("Quiz is locked — complete the lesson first");

  const existingAttempts = await prisma.attempt.findMany({
    where: { userId: session.user.id, quizId },
    orderBy: { attemptNumber: "asc" },
  });

  // Lazily finalize any attempt left IN_PROGRESS past its deadline before
  // evaluating the checks below — otherwise a trainee who abandons attempt 1
  // after the timer expires (without saving/submitting again) would find
  // it stuck IN_PROGRESS forever and be permanently blocked from attempt 2.
  const synced = await Promise.all(existingAttempts.map((a) => syncExpiry(a.id)));

  if (synced.some((a) => a.status === "IN_PROGRESS")) {
    throw new ForbiddenError("An attempt is already in progress");
  }
  const allowedAttempts = await getAllowedAttempts(session.user.id, quizId);
  if (synced.length >= allowedAttempts) {
    throw new ForbiddenError("Maximum attempts reached");
  }

  const attemptNumber = synced.length + 1;

  return prisma.$transaction(async (tx) => {
    const attempt = await tx.attempt.create({
      data: { userId: session.user.id, quizId, attemptNumber, status: "IN_PROGRESS" },
    });
    await tx.attemptAnswer.createMany({
      data: quiz.questions.map((q) => ({
        attemptId: attempt.id,
        questionId: q.id,
        questionPrompt: q.prompt,
        questionType: q.type,
        options: q.options === null ? undefined : (q.options as object),
        correctOption: q.correctOption,
      })),
    });
    return attempt;
  });
}
