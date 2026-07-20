import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { markLessonComplete } from "@/lib/content/lesson-completion";
import { createQuestion } from "@/lib/questions/manage";
import { approveQuestion } from "@/lib/questions/approve";
import { startAttempt } from "@/lib/quiz/start-attempt";
import { saveAnswers } from "@/lib/quiz/save-answers";
import { submitAttempt } from "@/lib/quiz/submit-attempt";
import { createEphemeralQuiz, deleteEphemeralQuiz } from "@/lib/quiz/attempt-test-fixtures";
import { gradeAnswer, listPendingGrading } from "./grading";

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

describe("listPendingGrading / gradeAnswer", () => {
  let trainee: { id: string };
  let admin: { id: string };
  let lesson: { id: string };
  let quiz: { id: string };
  let session: Session;
  let adminSession: Session;
  let pendingAttemptId: string;
  let freeTextAnswerId: string;
  let mcqAnswerId: string;

  beforeAll(async () => {
    trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    session = sessionFor(trainee.id, "TRAINEE");
    adminSession = sessionFor(admin.id, "ADMIN");

    const fixture = await createEphemeralQuiz("سؤال 6: قائمة التصحيح", 600);
    lesson = fixture.lesson;
    quiz = fixture.quiz;
    await markLessonComplete(session, lesson.id);

    const freeText = await createQuestion(adminSession, quiz.id, {
      type: "FREE_TEXT",
      prompt: "اشرح خطوات معالجة شكوى عميل.",
    });
    await approveQuestion(adminSession, freeText.id);

    const attempt = await startAttempt(session, quiz.id);
    pendingAttemptId = attempt.id;
    const answers = await prisma.attemptAnswer.findMany({ where: { attemptId: attempt.id } });
    mcqAnswerId = answers.find((a) => a.questionType === "MCQ")!.id;
    freeTextAnswerId = answers.find((a) => a.questionType === "FREE_TEXT")!.id;

    await saveAnswers(session, attempt.id, [
      { questionId: answers.find((a) => a.questionType === "MCQ")!.questionId!, selectedOption: "a" },
      {
        questionId: answers.find((a) => a.questionType === "FREE_TEXT")!.questionId!,
        textAnswer: "أستمع، أعتذر، ثم أحل المشكلة.",
      },
    ]);
    await submitAttempt(session, attempt.id);
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
  });

  it("rejects non-admin callers for both actions", async () => {
    await expect(listPendingGrading(sessionFor("caller", "TRAINEE"))).rejects.toThrow(ForbiddenError);
    await expect(
      gradeAnswer(sessionFor("caller", "TRAINEE"), freeTextAnswerId, true, "جيد"),
    ).rejects.toThrow(ForbiddenError);
  });

  it("lists the ungraded FREE_TEXT answer but not the already-auto-graded MCQ one", async () => {
    const pending = await listPendingGrading(adminSession);
    const ids = pending.map((a) => a.id);
    expect(ids).toContain(freeTextAnswerId);
    expect(ids).not.toContain(mcqAnswerId); // auto-graded, isCorrect already set
  });

  it("404s on an unknown answer", async () => {
    await expect(gradeAnswer(adminSession, "does-not-exist", true, "x")).rejects.toThrow(NotFoundError);
  });

  it("refuses to manually grade an auto-graded answer", async () => {
    await expect(gradeAnswer(adminSession, mcqAnswerId, true, "x")).rejects.toThrow(ForbiddenError);
  });

  it("grades the FREE_TEXT answer, records feedback/grader, audits it, and removes it from the queue", async () => {
    const graded = await gradeAnswer(adminSession, freeTextAnswerId, true, "إجابة جيدة ومنظمة.");
    expect(graded.isCorrect).toBe(true);
    expect(graded.feedback).toBe("إجابة جيدة ومنظمة.");
    expect(graded.gradedById).toBe(admin.id);
    expect(graded.gradedAt).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { action: "answer_graded", targetId: freeTextAnswerId },
    });
    expect(audit).toBeDefined();
    expect(audit?.actorId).toBe(admin.id);

    const pending = await listPendingGrading(adminSession);
    expect(pending.map((a) => a.id)).not.toContain(freeTextAnswerId);
  });

  it("still leaves the attempt PENDING_MANUAL_GRADE with score/passed null even once graded (open item #4)", async () => {
    const attempt = await prisma.attempt.findUniqueOrThrow({ where: { id: pendingAttemptId } });
    expect(attempt.status).toBe("PENDING_MANUAL_GRADE");
    expect(attempt.score).toBeNull();
    expect(attempt.passed).toBeNull();
  });

  it("refuses to grade a FREE_TEXT answer whose attempt hasn't been submitted yet", async () => {
    // A manually-graded-type answer only ever exists on a PENDING_MANUAL_GRADE
    // attempt once submitted (attempt-lifecycle.ts routes it there
    // unconditionally) — so the only way to see this rejection for the
    // *right* reason (attempt status, not question type) is an attempt
    // that's still IN_PROGRESS.
    const secondFixture = await createEphemeralQuiz("سؤال 6: محاولة لم تُسلَّم بعد", 600);
    await markLessonComplete(session, secondFixture.lesson.id);
    const secondFreeText = await createQuestion(adminSession, secondFixture.quiz.id, {
      type: "FREE_TEXT",
      prompt: "سؤال حر آخر.",
    });
    await approveQuestion(adminSession, secondFreeText.id);

    const inProgressAttempt = await startAttempt(session, secondFixture.quiz.id);
    const inProgressAnswers = await prisma.attemptAnswer.findMany({ where: { attemptId: inProgressAttempt.id } });
    const unsubmittedFreeText = inProgressAnswers.find((a) => a.questionType === "FREE_TEXT")!;

    await expect(gradeAnswer(adminSession, unsubmittedFreeText.id, true, "x")).rejects.toThrow(ForbiddenError);

    await deleteEphemeralQuiz(secondFixture.lesson.id);
  });
});
