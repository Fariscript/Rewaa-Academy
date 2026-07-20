import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError } from "@/lib/errors";
import { markLessonComplete } from "@/lib/content/lesson-completion";
import { createQuestion, retireQuestion } from "@/lib/questions/manage";
import { startAttempt } from "./start-attempt";
import { createEphemeralQuiz, deleteEphemeralQuiz } from "./attempt-test-fixtures";

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

describe("startAttempt (POST /api/quizzes/:id/attempts)", () => {
  let trainee: { id: string };
  let lesson: { id: string };
  let quiz: { id: string };
  let session: Session;

  beforeAll(async () => {
    trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    session = sessionFor(trainee.id, "TRAINEE");
    const fixture = await createEphemeralQuiz("سؤال 4ب: بدء المحاولة", 600);
    lesson = fixture.lesson;
    quiz = fixture.quiz;
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
  });

  it("rejects starting a quiz whose lesson isn't complete yet", async () => {
    await expect(startAttempt(session, quiz.id)).rejects.toThrow(ForbiddenError);
  });

  it("creates attempt #1 once unlocked, with a snapshot of every question", async () => {
    await markLessonComplete(session, lesson.id);
    const attempt = await startAttempt(session, quiz.id);
    expect(attempt.attemptNumber).toBe(1);
    expect(attempt.status).toBe("IN_PROGRESS");

    const answers = await prisma.attemptAnswer.findMany({ where: { attemptId: attempt.id } });
    expect(answers).toHaveLength(2);
  });

  it("refuses a second concurrent attempt while #1 is still in progress", async () => {
    await expect(startAttempt(session, quiz.id)).rejects.toThrow(ForbiddenError);
  });

  it("allows attempt #2 once #1 is finalized, and blocks a 3rd regardless of outcome", async () => {
    const inProgress = await prisma.attempt.findFirstOrThrow({
      where: { userId: trainee.id, quizId: quiz.id, attemptNumber: 1 },
    });
    await prisma.attempt.update({
      where: { id: inProgress.id },
      data: { status: "SUBMITTED", submittedAt: new Date(), score: 0, passed: false },
    });

    const attempt2 = await startAttempt(session, quiz.id);
    expect(attempt2.attemptNumber).toBe(2);

    await prisma.attempt.update({
      where: { id: attempt2.id },
      data: { status: "SUBMITTED", submittedAt: new Date(), score: 0, passed: false },
    });

    await expect(startAttempt(session, quiz.id)).rejects.toThrow("Maximum attempts reached");
  });
});

describe("startAttempt: abandoned expired attempt doesn't block the next one", () => {
  let trainee: { id: string };
  let lesson: { id: string };
  let quiz: { id: string };
  let session: Session;

  beforeAll(async () => {
    trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    session = sessionFor(trainee.id, "TRAINEE");
    // 1-second time limit so it's trivially already "expired" once we
    // backdate startedAt below.
    const fixture = await createEphemeralQuiz("سؤال 4ب: محاولة منتهية مهجورة", 1);
    lesson = fixture.lesson;
    quiz = fixture.quiz;
    await markLessonComplete(session, lesson.id);
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
  });

  it("finalizes an abandoned, expired attempt 1 as AUTO_SUBMITTED and lets attempt 2 start", async () => {
    const attempt1 = await startAttempt(session, quiz.id);
    expect(attempt1.status).toBe("IN_PROGRESS");

    // Simulate "abandoned": timer expired, trainee never saved or submitted.
    await prisma.attempt.update({
      where: { id: attempt1.id },
      data: { startedAt: new Date(Date.now() - 10_000) },
    });

    const attempt2 = await startAttempt(session, quiz.id);
    expect(attempt2.attemptNumber).toBe(2);
    expect(attempt2.status).toBe("IN_PROGRESS");

    const finalizedAttempt1 = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt1.id } });
    expect(finalizedAttempt1.status).toBe("AUTO_SUBMITTED");
    expect(finalizedAttempt1.submittedAt).not.toBeNull();
    expect(finalizedAttempt1.score).not.toBeNull();
  });
});

describe("startAttempt: only APPROVED questions are ever served (T-12, T-16, slice 5e)", () => {
  let trainee: { id: string };
  let admin: { id: string };
  let lesson: { id: string };
  let quiz: { id: string };
  let session: Session;

  beforeAll(async () => {
    trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    session = sessionFor(trainee.id, "TRAINEE");
    const fixture = await createEphemeralQuiz("سؤال 5هـ: أسئلة معتمدة فقط", 600);
    lesson = fixture.lesson;
    quiz = fixture.quiz;
    await markLessonComplete(session, lesson.id);
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
  });

  it("snapshots only APPROVED questions, skipping a DRAFT one on the same quiz", async () => {
    const adminSession = sessionFor(admin.id, "ADMIN");
    const draft = await createQuestion(adminSession, quiz.id, {
      type: "MCQ",
      prompt: "سؤال مسودة لم تتم الموافقة عليه بعد",
      options: [
        { id: "a", text: "أ" },
        { id: "b", text: "ب" },
      ],
      correctOption: "a",
    });

    const attempt = await startAttempt(session, quiz.id);
    const answers = await prisma.attemptAnswer.findMany({ where: { attemptId: attempt.id } });
    expect(answers).toHaveLength(2); // the 2 pre-approved fixture questions, not the draft
    expect(answers.some((a) => a.questionId === draft.id)).toBe(false);
  });

  it("refuses to start a quiz with zero approved questions", async () => {
    const noneApprovedFixture = await createEphemeralQuiz("سؤال 5هـ: بلا أسئلة معتمدة", 600);
    await markLessonComplete(session, noneApprovedFixture.lesson.id);
    const adminSession = sessionFor(admin.id, "ADMIN");
    const questions = await prisma.question.findMany({ where: { quizId: noneApprovedFixture.quiz.id } });
    for (const question of questions) {
      await retireQuestion(adminSession, question.id); // approved -> retired, so 0 remain eligible
    }

    await expect(startAttempt(session, noneApprovedFixture.quiz.id)).rejects.toThrow(
      "Quiz has no approved questions yet",
    );

    await deleteEphemeralQuiz(noneApprovedFixture.lesson.id);
  });
});
