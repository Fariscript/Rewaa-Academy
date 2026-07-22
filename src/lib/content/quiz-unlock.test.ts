import { afterAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { markLessonComplete } from "./lesson-completion";
import { isQuizUnlocked } from "./quiz-unlock";
import { startAttempt } from "@/lib/quiz/start-attempt";
import { saveAnswers } from "@/lib/quiz/save-answers";
import { submitAttempt } from "@/lib/quiz/submit-attempt";
import { createEphemeralChain, createEphemeralQuiz, deleteEphemeralQuiz } from "@/lib/quiz/attempt-test-fixtures";

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

describe("isQuizUnlocked (GET /api/quizzes/:id/unlock-status)", () => {
  afterAll(async () => {
    const trainee = await prisma.user.findUnique({ where: { email: "trainee@example.com" } });
    if (trainee) {
      await prisma.lessonCompletion.deleteMany({ where: { userId: trainee.id } });
    }
  });

  it("throws UnauthenticatedError with no session", async () => {
    await expect(isQuizUnlocked(null, "does-not-matter")).rejects.toThrow(UnauthenticatedError);
  });

  it("404s on an unknown quiz", async () => {
    const trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    await expect(isQuizUnlocked(sessionFor(trainee.id, "TRAINEE"), "does-not-exist")).rejects.toThrow(
      NotFoundError,
    );
  });

  it("rejects a quiz outside the caller's assigned sector", async () => {
    const trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } }); // assigned to الخدمات
    const otherSectorQuiz = await prisma.quiz.findFirstOrThrow({
      where: { title: "اختبار: الرد على اعتراض السعر" }, // lives under التجزئة
    });
    await expect(isQuizUnlocked(sessionFor(trainee.id, "TRAINEE"), otherSectorQuiz.id)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("is locked before completion and unlocks immediately after, without side effects", async () => {
    const trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    const lesson = await prisma.lesson.findFirstOrThrow({ where: { title: "حساب التكلفة" } });
    const quiz = await prisma.quiz.findUniqueOrThrow({ where: { lessonId: lesson.id } });
    const session = sessionFor(trainee.id, "TRAINEE");

    expect(await isQuizUnlocked(session, quiz.id)).toBe(false);

    // Scoped to this test's own (trainee, lesson) pair — other test files
    // touch this same fixture trainee but different lessons, so a global
    // count would be vulnerable to cross-file interference.
    const completionRowFilter = { userId: trainee.id, lessonId: lesson.id };
    const completionsBefore = await prisma.lessonCompletion.count({ where: completionRowFilter });
    await isQuizUnlocked(session, quiz.id); // repeat check: read-only
    const completionsAfter = await prisma.lessonCompletion.count({ where: completionRowFilter });
    expect(completionsAfter).toBe(completionsBefore);

    await markLessonComplete(session, lesson.id);
    expect(await isQuizUnlocked(session, quiz.id)).toBe(true);
  });
});

// Open items #3/#3b (RESOLVED 2026-07-22, see CLAUDE.md): chapter/topic-
// chain-scoped sequential ordering — passing a lesson's quiz gates the
// NEXT lesson's quiz in the same chain (Unit), but never affects an
// unrelated chain, matching the owner's own example (a failed call-skills
// chain must not block an unrelated Zoho CRM lesson).
describe("isQuizUnlocked: chain-ordering (open items #3/#3b)", () => {
  it("locks the next lesson's quiz until the previous lesson's quiz is passed, without affecting an unrelated chain", async () => {
    const trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    const session = sessionFor(trainee.id, "TRAINEE");

    const { pairs: callSkillsChain } = await createEphemeralChain([
      "مهارات المكالمات: المكالمة الأولى",
      "مهارات المكالمات: المكالمة الثانية",
    ]);
    const { lesson: zohoLesson, quiz: zohoQuiz } = await createEphemeralQuiz("Zoho CRM: الاستخدام الأساسي");

    try {
      const [first, second] = callSkillsChain;

      // Complete lesson 1, fail both attempts on its quiz.
      await markLessonComplete(session, first.lesson.id);
      await submitWithScore(session, first.quiz.id, false, false);
      await submitWithScore(session, first.quiz.id, false, false);

      // Lesson 2 can still be marked complete (T-33/lesson access is
      // unaffected — only its QUIZ is chain-gated), but its quiz must stay
      // locked: the chain prerequisite (lesson 1's quiz passed) isn't met.
      await markLessonComplete(session, second.lesson.id);
      expect(await isQuizUnlocked(session, second.quiz.id)).toBe(false);

      // An unrelated chain (different Unit entirely) is never affected by
      // the call-skills chain's failure — the owner's own example.
      await markLessonComplete(session, zohoLesson.id);
      expect(await isQuizUnlocked(session, zohoQuiz.id)).toBe(true);

      // Redo lesson 1 (grants a fresh window per the redo-loop) and pass
      // it — lesson 2's quiz must unlock now that the prerequisite is met.
      await markLessonComplete(session, first.lesson.id);
      await submitWithScore(session, first.quiz.id, true, true);
      expect(await isQuizUnlocked(session, second.quiz.id)).toBe(true);
    } finally {
      await deleteEphemeralQuiz(callSkillsChain[0].lesson.id);
      await deleteEphemeralQuiz(zohoLesson.id);
    }
  });

  it("first lesson in a chain has no prerequisite (position 0)", async () => {
    const trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    const session = sessionFor(trainee.id, "TRAINEE");
    const { pairs } = await createEphemeralChain(["سلسلة: الدرس الأول فقط"]);
    const [only] = pairs;

    try {
      await markLessonComplete(session, only.lesson.id);
      expect(await isQuizUnlocked(session, only.quiz.id)).toBe(true);
    } finally {
      await deleteEphemeralQuiz(only.lesson.id);
    }
  });
});
