import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { markLessonComplete } from "@/lib/content/lesson-completion";
import { startAttempt } from "@/lib/quiz/start-attempt";
import { saveAnswers } from "@/lib/quiz/save-answers";
import { submitAttempt } from "@/lib/quiz/submit-attempt";
import { getQuizOutcome } from "@/lib/quiz/outcome";
import { getQuizDashboard } from "@/lib/dashboard/quiz-dashboard";
import { createEphemeralQuiz, deleteEphemeralQuiz } from "@/lib/quiz/attempt-test-fixtures";
import { getAllowedAttempts, grantExtraAttempt } from "./attempt-override";

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

async function failAttempt(session: Session, attemptId: string) {
  const answers = await prisma.attemptAnswer.findMany({ where: { attemptId } });
  const mcq = answers.find((a) => a.questionType === "MCQ")!;
  const trueFalse = answers.find((a) => a.questionType === "TRUE_FALSE")!;
  await saveAnswers(session, attemptId, [
    { questionId: mcq.questionId!, selectedOption: "b" },
    { questionId: trueFalse.questionId!, selectedOption: "false" },
  ]);
  return submitAttempt(session, attemptId);
}

describe("grantExtraAttempt: role gate, validation, audit (NFR-05)", () => {
  let trainee: { id: string };
  let admin: { id: string };
  let lesson: { id: string };
  let quiz: { id: string };
  let adminSession: Session;

  beforeAll(async () => {
    trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    adminSession = sessionFor(admin.id, "ADMIN");
    const fixture = await createEphemeralQuiz("سؤال 10: صلاحيات منح المحاولات", 600);
    lesson = fixture.lesson;
    quiz = fixture.quiz;
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
  });

  it("is Admin-only", async () => {
    await expect(grantExtraAttempt(null, trainee.id, quiz.id, "سبب")).rejects.toThrow(UnauthenticatedError);
    await expect(
      grantExtraAttempt(sessionFor(trainee.id, "TRAINEE"), trainee.id, quiz.id, "سبب"),
    ).rejects.toThrow(ForbiddenError);
  });

  it("rejects unknown quiz/trainee, non-trainee targets, and empty reasons", async () => {
    await expect(grantExtraAttempt(adminSession, trainee.id, "no-such-quiz", "سبب")).rejects.toThrow(NotFoundError);
    await expect(grantExtraAttempt(adminSession, "no-such-user", quiz.id, "سبب")).rejects.toThrow(NotFoundError);
    await expect(grantExtraAttempt(adminSession, admin.id, quiz.id, "سبب")).rejects.toThrow(ForbiddenError);
    await expect(grantExtraAttempt(adminSession, trainee.id, quiz.id, "   ")).rejects.toThrow(ForbiddenError);
  });

  it("raises the cap by 1 per grant and writes an audit entry", async () => {
    expect(await getAllowedAttempts(trainee.id, quiz.id)).toBe(2);

    const { allowedAttempts } = await grantExtraAttempt(adminSession, trainee.id, quiz.id, "ظرف استثنائي موثق");
    expect(allowedAttempts).toBe(3);
    expect(await getAllowedAttempts(trainee.id, quiz.id)).toBe(3);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "attempt_cap_override_granted", targetId: trainee.id, actorId: admin.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit!.metadata).toMatchObject({
      quizId: quiz.id,
      reason: "ظرف استثنائي موثق",
      newAllowedAttempts: 3,
    });

    // The cap on an unrelated quiz is untouched.
    const other = await createEphemeralQuiz("سؤال 10: اختبار آخر غير معني", 600);
    expect(await getAllowedAttempts(trainee.id, other.quiz.id)).toBe(2);
    await deleteEphemeralQuiz(other.lesson.id);
  });
});

describe("attempt-cap override end to end: a both-failed trainee gets attempt 3", () => {
  let trainee: { id: string };
  let admin: { id: string };
  let lesson: { id: string };
  let quiz: { id: string };
  let session: Session;
  let adminSession: Session;

  beforeAll(async () => {
    trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    session = sessionFor(trainee.id, "TRAINEE");
    adminSession = sessionFor(admin.id, "ADMIN");
    const fixture = await createEphemeralQuiz("سؤال 10: محاولة ثالثة بعد الفشل", 600);
    lesson = fixture.lesson;
    quiz = fixture.quiz;
    await markLessonComplete(session, lesson.id);

    const attempt1 = await startAttempt(session, quiz.id);
    await failAttempt(session, attempt1.id);
    const attempt2 = await startAttempt(session, quiz.id);
    await failAttempt(session, attempt2.id);
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
  });

  it("enforces the default cap of 2 before any override exists (T-3 unchanged)", async () => {
    await expect(startAttempt(session, quiz.id)).rejects.toThrow("Maximum attempts reached");

    const outcome = await getQuizOutcome(session, quiz.id);
    expect(outcome.status).toBe("FAILED_FINAL_ATTEMPT");
    expect(outcome.attemptsAllowed).toBe(2);

    const dashboard = await getQuizDashboard(adminSession, quiz.id);
    const row = dashboard.trainees.find((r) => r.trainee.id === trainee.id);
    expect(row?.status).toBe("FAILED_FINAL_ATTEMPT");
    expect(dashboard.summary.failedBothAttempts).toBe(1);
  });

  it("a grant returns the trainee to attempts-remaining and lets attempt 3 start", async () => {
    await grantExtraAttempt(adminSession, trainee.id, quiz.id, "أداء قريب من النجاح — فرصة إضافية");

    // Outcome flips off FAILED_FINAL_ATTEMPT: an attempt slot is open again.
    const outcome = await getQuizOutcome(session, quiz.id);
    expect(outcome.status).toBe("IN_PROGRESS");
    expect(outcome.attemptsAllowed).toBe(3);
    expect(outcome.attemptsUsed).toBe(2);

    // The dashboard flag clears too (T-23 reflects the raised cap).
    const dashboard = await getQuizDashboard(adminSession, quiz.id);
    expect(dashboard.summary.failedBothAttempts).toBe(0);

    // And attempt 3 actually starts.
    const attempt3 = await startAttempt(session, quiz.id);
    expect(attempt3.attemptNumber).toBe(3);

    // But attempt 4 does not — the raised cap is now the enforced cap.
    await failAttempt(session, attempt3.id);
    await expect(startAttempt(session, quiz.id)).rejects.toThrow("Maximum attempts reached");
  });
});
