import { afterAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { markLessonComplete } from "./lesson-completion";
import { isQuizUnlocked } from "./quiz-unlock";

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
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
