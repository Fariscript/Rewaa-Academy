import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { markLessonComplete } from "@/lib/content/lesson-completion";
import { isQuizUnlocked } from "@/lib/content/quiz-unlock";
import { startAttempt } from "./start-attempt";
import { saveAnswers } from "./save-answers";
import { submitAttempt } from "./submit-attempt";
import { getQuizOutcome } from "./outcome";
import { createEphemeralQuiz, deleteEphemeralQuiz } from "./attempt-test-fixtures";

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

async function answerAndSubmit(session: Session, attemptId: string, mcqRight: boolean, trueFalseRight: boolean) {
  const answers = await prisma.attemptAnswer.findMany({ where: { attemptId } });
  const mcq = answers.find((a) => a.questionType === "MCQ")!;
  const trueFalse = answers.find((a) => a.questionType === "TRUE_FALSE")!;
  await saveAnswers(session, attemptId, [
    { questionId: mcq.questionId!, selectedOption: mcqRight ? "a" : "b" },
    { questionId: trueFalse.questionId!, selectedOption: trueFalseRight ? "true" : "false" },
  ]);
  return submitAttempt(session, attemptId);
}

describe("getQuizOutcome: best-score-wins across attempts (T-20)", () => {
  let trainee: { id: string };
  let lesson: { id: string };
  let quiz: { id: string };
  let session: Session;

  beforeAll(async () => {
    trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    session = sessionFor(trainee.id, "TRAINEE");
    const fixture = await createEphemeralQuiz("سؤال 4د: أفضل نتيجة", 600);
    lesson = fixture.lesson;
    quiz = fixture.quiz;
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
  });

  it("is NOT_STARTED before any attempt", async () => {
    // Not unlocked yet either, but outcome only reports on attempts.
    await markLessonComplete(session, lesson.id);
    const outcome = await getQuizOutcome(session, quiz.id);
    expect(outcome).toEqual({ attemptsUsed: 0, bestScore: null, passed: false, status: "NOT_STARTED" });
  });

  it("is IN_PROGRESS while attempt 1 is open", async () => {
    const attempt1 = await startAttempt(session, quiz.id);
    const outcome = await getQuizOutcome(session, quiz.id);
    expect(outcome.status).toBe("IN_PROGRESS");
    expect(outcome.attemptsUsed).toBe(0);

    await answerAndSubmit(session, attempt1.id, false, false); // 0%, fails
  });

  it("stays IN_PROGRESS (retry available) after one failed attempt", async () => {
    const outcome = await getQuizOutcome(session, quiz.id);
    expect(outcome).toEqual({ attemptsUsed: 1, bestScore: 0, passed: false, status: "IN_PROGRESS" });
  });

  it("reports PASSED with the higher of the two scores once attempt 2 passes", async () => {
    const attempt2 = await startAttempt(session, quiz.id);
    await answerAndSubmit(session, attempt2.id, true, true); // 100%, passes

    const outcome = await getQuizOutcome(session, quiz.id);
    expect(outcome).toEqual({ attemptsUsed: 2, bestScore: 100, passed: true, status: "PASSED" });
  });
});

describe("getQuizOutcome: FAILED_FINAL_ATTEMPT is informational only (open item #1)", () => {
  let trainee: { id: string };
  let failedLesson: { id: string };
  let failedQuiz: { id: string };
  let untouchedLesson: { id: string };
  let untouchedQuiz: { id: string };
  let session: Session;

  beforeAll(async () => {
    trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    session = sessionFor(trainee.id, "TRAINEE");

    const failed = await createEphemeralQuiz("سؤال 4د: فشل المحاولتين", 600);
    failedLesson = failed.lesson;
    failedQuiz = failed.quiz;
    await markLessonComplete(session, failedLesson.id);

    const untouched = await createEphemeralQuiz("سؤال 4د: اختبار آخر بلا علاقة", 600);
    untouchedLesson = untouched.lesson;
    untouchedQuiz = untouched.quiz;

    const attempt1 = await startAttempt(session, failedQuiz.id);
    await answerAndSubmit(session, attempt1.id, false, false); // 0%
    const attempt2 = await startAttempt(session, failedQuiz.id);
    await answerAndSubmit(session, attempt2.id, true, false); // 50%
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(failedLesson.id);
    await deleteEphemeralQuiz(untouchedLesson.id);
  });

  it("reports FAILED_FINAL_ATTEMPT with the best (still failing) score", async () => {
    const outcome = await getQuizOutcome(session, failedQuiz.id);
    expect(outcome).toEqual({ attemptsUsed: 2, bestScore: 50, passed: false, status: "FAILED_FINAL_ATTEMPT" });
  });

  it("still just enforces the plain 2-attempt cap — no extra consequence wired", async () => {
    await expect(startAttempt(session, failedQuiz.id)).rejects.toThrow("Maximum attempts reached");
  });

  it("does not affect an unrelated quiz's unlock state", async () => {
    // Completing a different lesson still unlocks its quiz normally —
    // failing both attempts on one quiz has no cross-quiz side effect.
    await markLessonComplete(session, untouchedLesson.id);
    expect(await isQuizUnlocked(session, untouchedQuiz.id)).toBe(true);
  });
});
