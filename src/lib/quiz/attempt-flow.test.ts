import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError } from "@/lib/errors";
import { markLessonComplete } from "@/lib/content/lesson-completion";
import { createQuestion } from "@/lib/questions/manage";
import { approveQuestion } from "@/lib/questions/approve";
import { startAttempt } from "./start-attempt";
import { saveAnswers } from "./save-answers";
import { submitAttempt } from "./submit-attempt";
import { createEphemeralQuiz, deleteEphemeralQuiz } from "./attempt-test-fixtures";

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

describe("saveAnswers + submitAttempt", () => {
  let trainee: { id: string };
  let lesson: { id: string };
  let quiz: { id: string };
  let session: Session;

  beforeAll(async () => {
    trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    session = sessionFor(trainee.id, "TRAINEE");
    const fixture = await createEphemeralQuiz("سؤال 4ج: حفظ الإجابات والتسليم", 600);
    lesson = fixture.lesson;
    quiz = fixture.quiz;
    await markLessonComplete(session, lesson.id);
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
  });

  it("saves answers against the attempt's snapshot", async () => {
    const attempt = await startAttempt(session, quiz.id);
    const questions = await prisma.attemptAnswer.findMany({ where: { attemptId: attempt.id } });

    const updated = await saveAnswers(session, attempt.id, [
      { questionId: questions[0].questionId!, selectedOption: "a" },
    ]);
    const savedAnswer = updated.answers.find((a) => a.questionId === questions[0].questionId);
    expect(savedAnswer?.selectedOption).toBe("a");
  });

  it("rejects saving/submitting an attempt that belongs to someone else", async () => {
    const attempt = await prisma.attempt.findFirstOrThrow({ where: { quizId: quiz.id, userId: trainee.id } });
    const otherSession = sessionFor("someone-else", "TRAINEE");
    await expect(saveAnswers(otherSession, attempt.id, [])).rejects.toThrow(ForbiddenError);
    await expect(submitAttempt(otherSession, attempt.id)).rejects.toThrow(ForbiddenError);
  });

  it("submit scores correctly (one right, one wrong) and blocks further edits", async () => {
    const attempt = await prisma.attempt.findFirstOrThrow({ where: { quizId: quiz.id, userId: trainee.id } });
    const questions = await prisma.attemptAnswer.findMany({ where: { attemptId: attempt.id } });
    // One correct (MCQ "a"), one deliberately wrong (TRUE_FALSE should be "true").
    const mcq = questions.find((q) => q.questionType === "MCQ")!;
    const trueFalse = questions.find((q) => q.questionType === "TRUE_FALSE")!;
    await saveAnswers(session, attempt.id, [
      { questionId: mcq.questionId!, selectedOption: "a" },
      { questionId: trueFalse.questionId!, selectedOption: "false" },
    ]);

    const submitted = await submitAttempt(session, attempt.id);
    expect(submitted.status).toBe("SUBMITTED");
    expect(submitted.score).toBe(50);
    expect(submitted.passed).toBe(false);

    await expect(saveAnswers(session, attempt.id, [{ questionId: mcq.questionId!, selectedOption: "a" }])).rejects.toThrow(
      ForbiddenError,
    );
  });
});

describe("expiry mid-attempt: auto-submits whatever was saved", () => {
  let trainee: { id: string };
  let lesson: { id: string };
  let quiz: { id: string };
  let session: Session;

  beforeAll(async () => {
    trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    session = sessionFor(trainee.id, "TRAINEE");
    const fixture = await createEphemeralQuiz("سؤال 4ج: انتهاء الوقت أثناء المحاولة", 600);
    lesson = fixture.lesson;
    quiz = fixture.quiz;
    await markLessonComplete(session, lesson.id);
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
  });

  it("force-finalizes with the one saved answer when the deadline has passed", async () => {
    const attempt = await startAttempt(session, quiz.id);
    const questions = await prisma.attemptAnswer.findMany({ where: { attemptId: attempt.id } });
    const mcq = questions.find((q) => q.questionType === "MCQ")!;

    // Trainee answered the first question correctly, then the tab died —
    // never touched the second question or hit submit.
    await saveAnswers(session, attempt.id, [{ questionId: mcq.questionId!, selectedOption: "a" }]);
    await prisma.attempt.update({ where: { id: attempt.id }, data: { startedAt: new Date(Date.now() - 700_000) } });

    // Neither an explicit save nor submit is called — reading the outcome
    // via submitAttempt's own lazy-expiry check is what finalizes it.
    const finalized = await submitAttempt(session, attempt.id);
    expect(finalized.status).toBe("AUTO_SUBMITTED");
    expect(finalized.score).toBe(50); // 1 of 2 answered correctly, 1 left blank
    expect(finalized.passed).toBe(false);
  });
});

describe("submitting a manually-graded question routes to PENDING_MANUAL_GRADE (T-18)", () => {
  let trainee: { id: string };
  let admin: { id: string };
  let lesson: { id: string };
  let quiz: { id: string };
  let session: Session;

  beforeAll(async () => {
    trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    session = sessionFor(trainee.id, "TRAINEE");
    const fixture = await createEphemeralQuiz("سؤال 6: تصحيح يدوي", 600);
    lesson = fixture.lesson;
    quiz = fixture.quiz;
    await markLessonComplete(session, lesson.id);

    const adminSession = sessionFor(admin.id, "ADMIN");
    const freeText = await createQuestion(adminSession, quiz.id, {
      type: "FREE_TEXT",
      prompt: "صف كيف تتعامل مع عميل غاضب.",
    });
    await approveQuestion(adminSession, freeText.id);
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
  });

  it("scores auto-graded answers immediately but leaves score/passed null pending a human grade", async () => {
    const attempt = await startAttempt(session, quiz.id);
    const answers = await prisma.attemptAnswer.findMany({ where: { attemptId: attempt.id } });
    expect(answers).toHaveLength(3); // 2 auto-graded fixture questions + the FREE_TEXT one

    const mcq = answers.find((a) => a.questionType === "MCQ")!;
    const freeTextAnswer = answers.find((a) => a.questionType === "FREE_TEXT")!;
    await saveAnswers(session, attempt.id, [
      { questionId: mcq.questionId!, selectedOption: "a" }, // correct
      { questionId: freeTextAnswer.questionId!, textAnswer: "أستمع له بهدوء ثم أقترح حلاً." },
    ]);

    const submitted = await submitAttempt(session, attempt.id);
    expect(submitted.status).toBe("PENDING_MANUAL_GRADE");
    expect(submitted.score).toBeNull();
    expect(submitted.passed).toBeNull();

    const savedAnswers = await prisma.attemptAnswer.findMany({ where: { attemptId: attempt.id } });
    const savedMcq = savedAnswers.find((a) => a.questionType === "MCQ")!;
    expect(savedMcq.isCorrect).toBe(true); // auto-graded, computed despite the attempt not being finalized

    const savedFreeText = savedAnswers.find((a) => a.questionType === "FREE_TEXT")!;
    expect(savedFreeText.textAnswer).toBe("أستمع له بهدوء ثم أقترح حلاً.");
    expect(savedFreeText.isCorrect).toBeNull(); // untouched until an Admin grades it
  });
});
