import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { markLessonComplete } from "@/lib/content/lesson-completion";
import { startAttempt } from "@/lib/quiz/start-attempt";
import { saveAnswers } from "@/lib/quiz/save-answers";
import { submitAttempt } from "@/lib/quiz/submit-attempt";
import { createEphemeralQuiz, deleteEphemeralQuiz } from "@/lib/quiz/attempt-test-fixtures";
import { getQuizTrends } from "./quiz-trends";

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

async function submitWithScore(session: Session, quizId: string, mcqRight: boolean, tfRight: boolean) {
  const attempt = await startAttempt(session, quizId);
  const rows = await prisma.attemptAnswer.findMany({ where: { attemptId: attempt.id } });
  const mcq = rows.find((r) => r.questionType === "MCQ")!;
  const tf = rows.find((r) => r.questionType === "TRUE_FALSE")!;
  await saveAnswers(session, attempt.id, [
    { questionId: mcq.questionId!, selectedOption: mcqRight ? "a" : "b" },
    { questionId: tf.questionId!, selectedOption: tfRight ? "true" : "false" },
  ]);
  await submitAttempt(session, attempt.id);
  return attempt.id;
}

describe("getQuizTrends (T-24)", () => {
  let trainee: { id: string };
  let admin: { id: string };
  let lesson: { id: string };
  let quiz: { id: string };
  let adminSession: Session;
  let traineeSession: Session;

  beforeAll(async () => {
    trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    adminSession = sessionFor(admin.id, "ADMIN");
    traineeSession = sessionFor(trainee.id, "TRAINEE");
    const fixture = await createEphemeralQuiz("سؤال ت-24: اتجاهات الاختبار", 600);
    lesson = fixture.lesson;
    quiz = fixture.quiz;
    await markLessonComplete(traineeSession, lesson.id);
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
  });

  it("is Admin-only and 404s unknown quizzes", async () => {
    await expect(getQuizTrends(null, quiz.id)).rejects.toThrow(UnauthenticatedError);
    await expect(getQuizTrends(traineeSession, quiz.id)).rejects.toThrow(ForbiddenError);
    await expect(getQuizTrends(adminSession, "no-such-quiz")).rejects.toThrow(NotFoundError);
  });

  it("buckets finalized attempts by week and attempt number", async () => {
    // Attempt 1: 0% (failed). Attempt 2: 100% (passed), backdated 1 week.
    await submitWithScore(traineeSession, quiz.id, false, false);
    const attempt2 = await submitWithScore(traineeSession, quiz.id, true, true);
    await prisma.attempt.update({
      where: { id: attempt2 },
      data: { submittedAt: new Date(Date.now() - 7 * 24 * 3600 * 1000) },
    });

    const trends = await getQuizTrends(adminSession, quiz.id, 8);
    expect(trends.weekly).toHaveLength(8);

    const totalBucketed = trends.weekly.reduce((sum, w) => sum + w.attempts, 0);
    expect(totalBucketed).toBe(2);

    const thisWeek = trends.weekly[trends.weekly.length - 1];
    expect(thisWeek.attempts).toBe(1);
    expect(thisWeek.averageScore).toBe(0);
    expect(thisWeek.passRate).toBe(0);

    const lastWeekWithData = trends.weekly.filter((w) => w.attempts > 0)[0];
    expect(lastWeekWithData.averageScore).toBe(100);
    expect(lastWeekWithData.passRate).toBe(1);

    expect(trends.byAttemptNumber).toEqual([
      { attemptNumber: 1, attempts: 1, averageScore: 0, passRate: 0 },
      { attemptNumber: 2, attempts: 1, averageScore: 100, passRate: 1 },
    ]);
  });
});
