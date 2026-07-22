import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { markLessonComplete } from "@/lib/content/lesson-completion";
import { startAttempt } from "@/lib/quiz/start-attempt";
import { saveAnswers } from "@/lib/quiz/save-answers";
import { submitAttempt } from "@/lib/quiz/submit-attempt";
import { getQuizOutcome } from "@/lib/quiz/outcome";
import { createEphemeralQuiz, deleteEphemeralQuiz } from "@/lib/quiz/attempt-test-fixtures";
import { getQuizDashboard } from "./quiz-dashboard";

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

async function ensureTrainee(email: string, sectorId: string) {
  return prisma.user.upsert({
    where: { email },
    update: { sectorId, role: "TRAINEE" },
    create: { email, role: "TRAINEE", sectorId },
  });
}

// answerCorrectly controls BOTH fixture questions — createEphemeralQuiz's
// quiz has an MCQ and a TRUE_FALSE, so leaving one unanswered while
// answering the other correctly only yields 50%, not enough to pass 95%.
async function submitWith(session: Session, attemptId: string, answerCorrectly: boolean) {
  const answers = await prisma.attemptAnswer.findMany({ where: { attemptId } });
  const mcq = answers.find((a) => a.questionType === "MCQ")!;
  const trueFalse = answers.find((a) => a.questionType === "TRUE_FALSE")!;
  await saveAnswers(session, attemptId, [
    { questionId: mcq.questionId!, selectedOption: answerCorrectly ? "a" : "b" },
    { questionId: trueFalse.questionId!, selectedOption: answerCorrectly ? "true" : "false" },
  ]);
  return submitAttempt(session, attemptId);
}

describe("getQuizDashboard (GET /api/admin/dashboard/quizzes/:id)", () => {
  let admin: { id: string };
  let lesson: { id: string };
  let quiz: { id: string };
  let sectorId: string;

  const emails = {
    notStarted: "dash-not-started@example.com",
    inProgress: "dash-in-progress@example.com",
    onAttempt2: "dash-on-attempt-2@example.com",
    failedBoth: "dash-failed-both@example.com",
    passed: "dash-passed@example.com",
    everFailed: "dash-ever-failed@example.com",
  };

  beforeAll(async () => {
    admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    const sector = await prisma.sector.findUniqueOrThrow({ where: { name: "الخدمات" } });
    sectorId = sector.id;

    const fixture = await createEphemeralQuiz("سؤال 7: لوحة التحكم", 600);
    lesson = fixture.lesson;
    quiz = fixture.quiz;

    for (const email of Object.values(emails)) {
      const trainee = await ensureTrainee(email, sectorId);
      const session = sessionFor(trainee.id, "TRAINEE");
      await markLessonComplete(session, lesson.id);
    }

    // notStarted: touches nothing further.

    // inProgress: starts attempt 1, leaves it open.
    const inProgressTrainee = await prisma.user.findUniqueOrThrow({ where: { email: emails.inProgress } });
    await startAttempt(sessionFor(inProgressTrainee.id, "TRAINEE"), quiz.id);

    // onAttempt2: fails attempt 1, starts (and leaves open) attempt 2.
    const onAttempt2Trainee = await prisma.user.findUniqueOrThrow({ where: { email: emails.onAttempt2 } });
    const onAttempt2Session = sessionFor(onAttempt2Trainee.id, "TRAINEE");
    const a1 = await startAttempt(onAttempt2Session, quiz.id);
    await submitWith(onAttempt2Session, a1.id, false);
    await startAttempt(onAttempt2Session, quiz.id);

    // failedBoth: fails both attempts.
    const failedBothTrainee = await prisma.user.findUniqueOrThrow({ where: { email: emails.failedBoth } });
    const failedBothSession = sessionFor(failedBothTrainee.id, "TRAINEE");
    const fb1 = await startAttempt(failedBothSession, quiz.id);
    await submitWith(failedBothSession, fb1.id, false);
    const fb2 = await startAttempt(failedBothSession, quiz.id);
    await submitWith(failedBothSession, fb2.id, false);

    // passed: passes on attempt 1.
    const passedTrainee = await prisma.user.findUniqueOrThrow({ where: { email: emails.passed } });
    const passedSession = sessionFor(passedTrainee.id, "TRAINEE");
    const p1 = await startAttempt(passedSession, quiz.id);
    await submitWith(passedSession, p1.id, true);

    // everFailed: fails both attempts AND has getQuizOutcome called for
    // them directly (open item #1's permanent-record write only happens
    // there, not inside computeQuizOutcome/getQuizDashboard's bulk path —
    // this trainee exercises that write; failedBoth above deliberately
    // does not, so the two trainees together prove the distinction).
    const everFailedTrainee = await prisma.user.findUniqueOrThrow({ where: { email: emails.everFailed } });
    const everFailedSession = sessionFor(everFailedTrainee.id, "TRAINEE");
    const ef1 = await startAttempt(everFailedSession, quiz.id);
    await submitWith(everFailedSession, ef1.id, false);
    const ef2 = await startAttempt(everFailedSession, quiz.id);
    await submitWith(everFailedSession, ef2.id, false);
    await getQuizOutcome(everFailedSession, quiz.id);
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
    await prisma.user.deleteMany({ where: { email: { in: Object.values(emails) } } });
  });

  it("rejects non-admin callers", async () => {
    await expect(getQuizDashboard(sessionFor("caller", "TRAINEE"), quiz.id)).rejects.toThrow(ForbiddenError);
  });

  it("404s on an unknown quiz", async () => {
    await expect(getQuizDashboard(sessionFor(admin.id, "ADMIN"), "does-not-exist")).rejects.toThrow(NotFoundError);
  });

  it("computes per-trainee status and quiz-level summary correctly", async () => {
    const dashboard = await getQuizDashboard(sessionFor(admin.id, "ADMIN"), quiz.id);

    const byEmail = (email: string) => dashboard.trainees.find((r) => r.trainee.email === email)!;

    expect(byEmail(emails.notStarted).status).toBe("NOT_STARTED");
    expect(byEmail(emails.inProgress).status).toBe("IN_PROGRESS");
    expect(byEmail(emails.inProgress).onAttempt2).toBe(false);
    expect(byEmail(emails.onAttempt2).status).toBe("IN_PROGRESS");
    expect(byEmail(emails.onAttempt2).onAttempt2).toBe(true); // T-21: "who's on attempt 2"
    expect(byEmail(emails.failedBoth).status).toBe("FAILED_FINAL_ATTEMPT"); // T-23
    expect(byEmail(emails.passed).status).toBe("PASSED");
    expect(byEmail(emails.passed).bestScore).toBe(100);

    // Open item #1: the two distinct fields, not collapsed into one.
    // failedBoth never had getQuizOutcome called for it directly (only
    // submitAttempt, then this dashboard read) — the permanent record is
    // only written by getQuizOutcome, so it must still be false here even
    // though the point-in-time status is FAILED_FINAL_ATTEMPT.
    expect(byEmail(emails.failedBoth).everFailed).toBe(false);
    // everFailed DID have getQuizOutcome called directly after failing —
    // its permanent record exists and must show true here too.
    expect(byEmail(emails.everFailed).everFailed).toBe(true);
    expect(byEmail(emails.everFailed).status).toBe("FAILED_FINAL_ATTEMPT");
    expect(byEmail(emails.notStarted).everFailed).toBe(false);
    expect(byEmail(emails.passed).everFailed).toBe(false);

    // Only the 6 dashboard-fixture trainees may or may not be the only
    // ones in this sector (trainee@example.com is also assigned to
    // الخدمات) — assert containment, not an exact count/average.
    expect(dashboard.summary.totalTrainees).toBeGreaterThanOrEqual(6);
    expect(dashboard.summary.notStarted).toBeGreaterThanOrEqual(1);
    expect(dashboard.summary.inProgress).toBeGreaterThanOrEqual(2);
    expect(dashboard.summary.passed).toBeGreaterThanOrEqual(1);
    expect(dashboard.summary.failedBothAttempts).toBeGreaterThanOrEqual(2);
    expect(dashboard.summary.everFailed).toBeGreaterThanOrEqual(1);
    expect(dashboard.summary.onAttempt2).toBeGreaterThanOrEqual(1);
    expect(dashboard.summary.averageScore).not.toBeNull(); // T-22
  });
});
