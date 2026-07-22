import { describe, expect, it } from "vitest";
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

async function submitWithScore(session: Session, quizId: string, mcqRight: boolean, tfRight: boolean) {
  const attempt = await startAttempt(session, quizId);
  const rows = await prisma.attemptAnswer.findMany({ where: { attemptId: attempt.id } });
  const mcq = rows.find((r) => r.questionType === "MCQ")!;
  const tf = rows.find((r) => r.questionType === "TRUE_FALSE")!;
  await saveAnswers(session, attempt.id, [
    { questionId: mcq.questionId!, selectedOption: mcqRight ? "a" : "b" },
    { questionId: tf.questionId!, selectedOption: tfRight ? "true" : "false" },
  ]);
  return submitAttempt(session, attempt.id);
}

// Open item #1 (RESOLVED 2026-07-22, see CLAUDE.md): a trainee who fails
// both attempts is not permanently stuck — redoing the lesson grants a
// fresh 2-attempt window automatically, repeating until they pass. The
// QuizFailureRecord row (permanent "ever failed" flag, distinct from
// `status`'s point-in-time state) is written as a side effect of
// getQuizOutcome — see src/lib/quiz/outcome.ts.
describe("redo-loop: fresh attempt window on lesson redo (open item #1)", () => {
  it("fails both attempts, redoes the lesson, gets a fresh window, then passes", async () => {
    const trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    const session = sessionFor(trainee.id, "TRAINEE");
    const { lesson, quiz } = await createEphemeralQuiz("اختبار حلقة الإعادة: النجاح لاحقًا");

    try {
      await markLessonComplete(session, lesson.id);

      // Attempts 1 and 2: both fail.
      await submitWithScore(session, quiz.id, false, false);
      await submitWithScore(session, quiz.id, false, false);

      let outcome = await getQuizOutcome(session, quiz.id);
      expect(outcome.status).toBe("FAILED_FINAL_ATTEMPT");
      expect(outcome.attemptsUsed).toBe(2);
      expect(outcome.attemptsAllowed).toBe(2);

      // Permanent record written the moment status first resolves to
      // FAILED_FINAL_ATTEMPT.
      const failureRecord = await prisma.quizFailureRecord.findUnique({
        where: { userId_quizId: { userId: trainee.id, quizId: quiz.id } },
      });
      expect(failureRecord).not.toBeNull();

      // Redo: marking an already-completed, currently-stuck lesson complete
      // again is the redo event — it must grant a fresh window automatically.
      await markLessonComplete(session, lesson.id);

      outcome = await getQuizOutcome(session, quiz.id);
      expect(outcome.attemptsAllowed).toBe(4);
      expect(outcome.status).not.toBe("FAILED_FINAL_ATTEMPT");

      const override = await prisma.attemptCapOverride.findFirst({
        where: { userId: trainee.id, quizId: quiz.id },
        orderBy: { createdAt: "desc" },
      });
      const systemUser = await prisma.user.findUniqueOrThrow({
        where: { email: "system-redo-loop@rewaa-internal.local" },
      });
      expect(override?.extraAttempts).toBe(2);
      expect(override?.grantedById).toBe(systemUser.id);

      // Attempt 3 (fails again), attempt 4 (passes) — breaks out of the loop.
      await submitWithScore(session, quiz.id, false, false);
      await submitWithScore(session, quiz.id, true, true);

      outcome = await getQuizOutcome(session, quiz.id);
      expect(outcome.passed).toBe(true);
      expect(outcome.status).toBe("PASSED");

      // The permanent record survives the eventual pass — current status
      // flipped to PASSED, but "ever failed" stays true forever, exactly
      // the distinction open item #1 asked for.
      const failureRecordAfterPass = await prisma.quizFailureRecord.findUnique({
        where: { userId_quizId: { userId: trainee.id, quizId: quiz.id } },
      });
      expect(failureRecordAfterPass).not.toBeNull();
      expect(failureRecordAfterPass?.firstFailedAt).toEqual(failureRecord?.firstFailedAt);
    } finally {
      await deleteEphemeralQuiz(lesson.id);
    }
  });

  it("stays stuck (FAILED_FINAL_ATTEMPT) until the trainee actually redoes the lesson", async () => {
    const trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    const session = sessionFor(trainee.id, "TRAINEE");
    const { lesson, quiz } = await createEphemeralQuiz("اختبار حلقة الإعادة: عالق حتى الإعادة");

    try {
      await markLessonComplete(session, lesson.id);
      await submitWithScore(session, quiz.id, false, false);
      await submitWithScore(session, quiz.id, false, false);

      const stuck = await getQuizOutcome(session, quiz.id);
      expect(stuck.status).toBe("FAILED_FINAL_ATTEMPT");
      expect(stuck.attemptsAllowed).toBe(2);

      const failureRecord = await prisma.quizFailureRecord.findUnique({
        where: { userId_quizId: { userId: trainee.id, quizId: quiz.id } },
      });
      expect(failureRecord).not.toBeNull();

      // Merely re-reading status (outcome or unlock check) is not a redo —
      // it must never itself trigger a grant.
      await getQuizOutcome(session, quiz.id);
      await isQuizUnlocked(session, quiz.id);

      const stillStuck = await getQuizOutcome(session, quiz.id);
      expect(stillStuck.attemptsAllowed).toBe(2);
      expect(stillStuck.status).toBe("FAILED_FINAL_ATTEMPT");

      const overrideCount = await prisma.attemptCapOverride.count({ where: { userId: trainee.id, quizId: quiz.id } });
      expect(overrideCount).toBe(0);
    } finally {
      await deleteEphemeralQuiz(lesson.id);
    }
  });
});
