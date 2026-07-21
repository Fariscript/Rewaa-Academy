import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { markLessonComplete } from "@/lib/content/lesson-completion";
import { startAttempt } from "@/lib/quiz/start-attempt";
import { saveAnswers } from "@/lib/quiz/save-answers";
import { submitAttempt } from "@/lib/quiz/submit-attempt";
import { createEphemeralQuiz, deleteEphemeralQuiz } from "@/lib/quiz/attempt-test-fixtures";
import { getTraineeReport } from "./trainee-report";

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

describe("getTraineeReport (T-24)", () => {
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
    const fixture = await createEphemeralQuiz("سؤال ت-24: تقرير المتدرب", 600);
    lesson = fixture.lesson;
    quiz = fixture.quiz;
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
  });

  it("is Admin-only and 404s non-trainees/unknown ids", async () => {
    await expect(getTraineeReport(null, trainee.id)).rejects.toThrow(UnauthenticatedError);
    await expect(getTraineeReport(traineeSession, trainee.id)).rejects.toThrow(ForbiddenError);
    await expect(getTraineeReport(adminSession, "no-such-user")).rejects.toThrow(NotFoundError);
    await expect(getTraineeReport(adminSession, admin.id)).rejects.toThrow(NotFoundError); // admins aren't trainees
  });

  it("summarizes completion, outcomes, and averages across the sector", async () => {
    await markLessonComplete(traineeSession, lesson.id);
    const attempt = await startAttempt(traineeSession, quiz.id);
    const rows = await prisma.attemptAnswer.findMany({ where: { attemptId: attempt.id } });
    const mcq = rows.find((r) => r.questionType === "MCQ")!;
    await saveAnswers(traineeSession, attempt.id, [{ questionId: mcq.questionId!, selectedOption: "a" }]);
    await submitAttempt(traineeSession, attempt.id); // 50% — failed, retry open

    const report = await getTraineeReport(adminSession, trainee.id);
    expect(report.trainee.sector?.name).toBe("الخدمات");
    expect(report.totals.totalLessons).toBeGreaterThanOrEqual(report.totals.totalQuizzes);
    expect(report.totals.lessonsCompleted).toBeGreaterThanOrEqual(1);

    const row = report.quizzes.find((q) => q.quizId === quiz.id);
    expect(row).toBeDefined();
    expect(row!.lessonTitle).toBe("سؤال ت-24: تقرير المتدرب");
    expect(row!.unitName).toBe("أول مكالمة");
    expect(row!.outcome.status).toBe("IN_PROGRESS"); // failed once, retry available
    expect(row!.outcome.bestScore).toBe(50);
    expect(row!.lastActivityAt).not.toBeNull();

    // averageBestScore only aggregates quizzes with a score.
    expect(report.totals.averageBestScore).not.toBeNull();
  });
});
