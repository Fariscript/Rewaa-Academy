import type { Session } from "next-auth";
import type { Attempt, AttemptAnswer, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { syncExpiry } from "./attempt-lifecycle";
import { getQuizOutcome, type QuizOutcome } from "./outcome";

// The ONLY shape of an attempt that may reach a trainee — as a route's JSON
// body or as a server-component prop (RSC props serialize to the client).
// AttemptAnswer rows carry the answer key (correctOption, snapshotted at
// attempt-start), so raw rows must never cross that boundary: with a
// 2-attempt cap, a leaked key on attempt 1 makes attempt 2 meaningless.
// correctOption is omitted here unconditionally — even after finalization —
// and per-item isCorrect/feedback stay hidden while the attempt is still
// IN_PROGRESS.
export interface TraineeAnswerView {
  questionId: string | null;
  questionPrompt: string;
  questionType: AttemptAnswer["questionType"];
  options: Prisma.JsonValue | null;
  selectedOption: string | null;
  textAnswer: string | null;
  isCorrect: boolean | null;
  feedback: string | null;
}

export interface TraineeAttemptView {
  id: string;
  quizId: string;
  quizTitle: string;
  attemptNumber: number;
  status: Attempt["status"];
  startedAt: Date;
  // T-32: the countdown deadline (startedAt + quiz.timeLimitSeconds). The
  // server remains the authority via syncExpiry — the client timer is
  // display-only.
  expiresAt: Date;
  // Lets the client correct for clock skew: remaining = expiresAt - now,
  // where now is the client clock shifted by (serverNow - clientNow).
  serverNow: Date;
  submittedAt: Date | null;
  score: number | null;
  passed: boolean | null;
  answers: TraineeAnswerView[];
}

export function toTraineeAttemptView(
  attempt: Attempt & { answers: AttemptAnswer[]; quiz: { title: string; timeLimitSeconds: number } },
): TraineeAttemptView {
  const inProgress = attempt.status === "IN_PROGRESS";
  return {
    id: attempt.id,
    quizId: attempt.quizId,
    quizTitle: attempt.quiz.title,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    startedAt: attempt.startedAt,
    expiresAt: new Date(attempt.startedAt.getTime() + attempt.quiz.timeLimitSeconds * 1000),
    serverNow: new Date(),
    submittedAt: attempt.submittedAt,
    score: attempt.score,
    passed: attempt.passed,
    answers: attempt.answers.map((a) => ({
      questionId: a.questionId,
      questionPrompt: a.questionPrompt,
      questionType: a.questionType,
      options: a.options,
      selectedOption: a.selectedOption,
      textAnswer: a.textAnswer,
      isCorrect: inProgress ? null : a.isCorrect,
      feedback: inProgress ? null : a.feedback,
    })),
  };
}

export interface TraineeQuizResult {
  quizId: string;
  quizTitle: string;
  lessonId: string;
  outcome: QuizOutcome;
  // Every attempt (finalized and open), oldest first, already redacted.
  attempts: TraineeAttemptView[];
}

// Everything the result page renders in one read. getQuizOutcome performs
// the sector scope check and lazy expiry sync; the attempt list is then
// inherently ownership-scoped by the userId filter.
export async function getQuizResultForTrainee(session: Session | null, quizId: string): Promise<TraineeQuizResult> {
  if (!session?.user) throw new UnauthenticatedError();

  const outcome = await getQuizOutcome(session, quizId);
  const quiz = await prisma.quiz.findUniqueOrThrow({
    where: { id: quizId },
    select: { title: true, lessonId: true },
  });
  const attempts = await prisma.attempt.findMany({
    where: { userId: session.user.id, quizId },
    orderBy: { attemptNumber: "asc" },
    include: { answers: { orderBy: { id: "asc" } }, quiz: true },
  });

  return {
    quizId,
    quizTitle: quiz.title,
    lessonId: quiz.lessonId,
    outcome,
    attempts: attempts.map(toTraineeAttemptView),
  };
}

// Read view of one attempt for its owner — what the quiz-taking screen
// renders and how an in-progress attempt is resumed after a refresh.
// Ownership is verified BEFORE syncExpiry: syncExpiry/finalizeAttempt trust
// attemptId unconditionally (TODO(ownership-audit-1) in
// attempt-lifecycle.ts), so every route-reachable caller must pre-verify —
// this function is the precedent. Reading also lazily finalizes an expired
// attempt (T-32), same as every other access path. Trainee self-read — no
// audit entry.
export async function getAttemptForTrainee(session: Session | null, attemptId: string): Promise<TraineeAttemptView> {
  if (!session?.user) throw new UnauthenticatedError();

  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId } });
  if (!attempt) throw new NotFoundError("Attempt not found");
  if (attempt.userId !== session.user.id) throw new ForbiddenError();

  await syncExpiry(attemptId);

  const fresh = await prisma.attempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: { answers: { orderBy: { id: "asc" } }, quiz: true },
  });
  return toTraineeAttemptView(fresh);
}
