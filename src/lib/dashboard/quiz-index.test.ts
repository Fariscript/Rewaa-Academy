import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, UnauthenticatedError } from "@/lib/errors";
import { createEphemeralQuiz, deleteEphemeralQuiz } from "@/lib/quiz/attempt-test-fixtures";
import { listQuizzesForAdmin } from "./quiz-index";

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

describe("listQuizzesForAdmin: the dashboard's quiz catalog", () => {
  let admin: { id: string };
  let trainee: { id: string };
  let lesson: { id: string };
  let quiz: { id: string };

  beforeAll(async () => {
    admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    const fixture = await createEphemeralQuiz("سؤال 10: فهرس الاختبارات", 450);
    lesson = fixture.lesson;
    quiz = fixture.quiz;
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
  });

  it("is Admin-only", async () => {
    await expect(listQuizzesForAdmin(null)).rejects.toThrow(UnauthenticatedError);
    await expect(listQuizzesForAdmin(sessionFor(trainee.id, "TRAINEE"))).rejects.toThrow(ForbiddenError);
  });

  it("returns every quiz with its taxonomy path and APPROVED-only question count", async () => {
    const rows = await listQuizzesForAdmin(sessionFor(admin.id, "ADMIN"));

    const row = rows.find((r) => r.quizId === quiz.id);
    expect(row).toBeDefined();
    expect(row!.lessonTitle).toBe("سؤال 10: فهرس الاختبارات");
    expect(row!.timeLimitSeconds).toBe(450);
    // The ephemeral fixture hangs off the seeded الخدمات hierarchy.
    expect(row!.sector.name).toBe("الخدمات");
    expect(row!.unitName).toBe("أول مكالمة");
    expect(row!.skillType).toBe("SOFT");
    // 2 APPROVED fixture questions; a DRAFT question must not count.
    expect(row!.approvedQuestionCount).toBe(2);

    await prisma.question.create({
      data: { quizId: quiz.id, type: "FREE_TEXT", prompt: "مسودة غير معتمدة", status: "DRAFT" },
    });
    const after = await listQuizzesForAdmin(sessionFor(admin.id, "ADMIN"));
    expect(after.find((r) => r.quizId === quiz.id)!.approvedQuestionCount).toBe(2);
  });
});
