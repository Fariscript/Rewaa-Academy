import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { markLessonComplete } from "@/lib/content/lesson-completion";
import { startAttempt } from "./start-attempt";
import { saveAnswers } from "./save-answers";
import { submitAttempt } from "./submit-attempt";
import { getAttemptForTrainee, toTraineeAttemptView } from "./attempt-view";
import { createEphemeralQuiz, deleteEphemeralQuiz } from "./attempt-test-fixtures";

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

describe("getAttemptForTrainee: ownership, redaction, lazy expiry", () => {
  let trainee: { id: string };
  let lesson: { id: string };
  let quiz: { id: string };
  let session: Session;

  beforeAll(async () => {
    trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    session = sessionFor(trainee.id, "TRAINEE");
    const fixture = await createEphemeralQuiz("سؤال 9: عرض المحاولة للمتدرب", 600);
    lesson = fixture.lesson;
    quiz = fixture.quiz;
    await markLessonComplete(session, lesson.id);
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
  });

  it("rejects unauthenticated, unknown-id, and non-owner reads (ownership before syncExpiry)", async () => {
    const attempt = await startAttempt(session, quiz.id);

    await expect(getAttemptForTrainee(null, attempt.id)).rejects.toThrow(UnauthenticatedError);
    await expect(getAttemptForTrainee(session, "no-such-attempt")).rejects.toThrow(NotFoundError);
    await expect(getAttemptForTrainee(sessionFor("someone-else", "TRAINEE"), attempt.id)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("never exposes the answer key, and hides isCorrect/feedback while IN_PROGRESS", async () => {
    const attempt = await prisma.attempt.findFirstOrThrow({ where: { quizId: quiz.id, userId: trainee.id } });
    const rows = await prisma.attemptAnswer.findMany({ where: { attemptId: attempt.id } });
    const mcq = rows.find((r) => r.questionType === "MCQ")!;
    await saveAnswers(session, attempt.id, [{ questionId: mcq.questionId!, selectedOption: "a" }]);

    const view = await getAttemptForTrainee(session, attempt.id);
    expect(view.status).toBe("IN_PROGRESS");
    expect(view.quizId).toBe(quiz.id);
    expect(view.answers).toHaveLength(2);
    for (const answer of view.answers) {
      expect("correctOption" in answer).toBe(false);
      expect(answer.isCorrect).toBeNull();
      expect(answer.feedback).toBeNull();
      expect(answer.questionPrompt.length).toBeGreaterThan(0);
    }
    // The serialized payload (what a route/RSC boundary would ship) must not
    // contain the answer-key column at all.
    expect(JSON.stringify(view)).not.toContain("correctOption");

    const saved = view.answers.find((a) => a.questionId === mcq.questionId);
    expect(saved?.selectedOption).toBe("a");
  });

  it("computes the T-32 countdown deadline from startedAt + timeLimitSeconds and reports serverNow", async () => {
    const attempt = await prisma.attempt.findFirstOrThrow({ where: { quizId: quiz.id, userId: trainee.id } });
    const before = Date.now();
    const view = await getAttemptForTrainee(session, attempt.id);
    const after = Date.now();

    expect(view.expiresAt.getTime()).toBe(view.startedAt.getTime() + 600 * 1000);
    expect(view.serverNow.getTime()).toBeGreaterThanOrEqual(before);
    expect(view.serverNow.getTime()).toBeLessThanOrEqual(after);
  });

  it("lazily auto-submits an expired attempt on read, then reveals isCorrect but still no answer key", async () => {
    const attempt = await prisma.attempt.findFirstOrThrow({ where: { quizId: quiz.id, userId: trainee.id } });
    await prisma.attempt.update({ where: { id: attempt.id }, data: { startedAt: new Date(Date.now() - 700_000) } });

    const view = await getAttemptForTrainee(session, attempt.id);
    expect(view.status).toBe("AUTO_SUBMITTED");
    expect(view.score).toBe(50); // MCQ answered correctly earlier, TRUE_FALSE left blank
    expect(view.passed).toBe(false);

    const mcqAnswer = view.answers.find((a) => a.questionType === "MCQ");
    expect(mcqAnswer?.isCorrect).toBe(true); // visible once finalized
    expect(JSON.stringify(view)).not.toContain("correctOption");
  });
});

describe("route-boundary redaction: saveAnswers/submitAttempt results pass through the trainee view", () => {
  let trainee: { id: string };
  let lesson: { id: string };
  let quiz: { id: string };
  let session: Session;

  beforeAll(async () => {
    trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    session = sessionFor(trainee.id, "TRAINEE");
    const fixture = await createEphemeralQuiz("سؤال 9ب: حجب مفتاح الإجابة في الردود", 600);
    lesson = fixture.lesson;
    quiz = fixture.quiz;
    await markLessonComplete(session, lesson.id);
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
  });

  it("PATCH-answers and POST-submit response shapes carry no correctOption", async () => {
    const attempt = await startAttempt(session, quiz.id);
    const rows = await prisma.attemptAnswer.findMany({ where: { attemptId: attempt.id } });
    const mcq = rows.find((r) => r.questionType === "MCQ")!;

    const savedResult = await saveAnswers(session, attempt.id, [
      { questionId: mcq.questionId!, selectedOption: "a" },
    ]);
    const savedView = toTraineeAttemptView(savedResult);
    expect(JSON.stringify(savedView)).not.toContain("correctOption");
    expect(savedView.answers.every((a) => a.isCorrect === null)).toBe(true);

    const submittedResult = await submitAttempt(session, attempt.id);
    const submittedView = toTraineeAttemptView(submittedResult);
    expect(submittedView.status).toBe("SUBMITTED");
    expect(JSON.stringify(submittedView)).not.toContain("correctOption");
  });
});
