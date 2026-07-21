import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { createEphemeralQuiz, deleteEphemeralQuiz } from "@/lib/quiz/attempt-test-fixtures";
import { getQuestionForAdmin, listQuizQuestions } from "./list";

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

describe("question-bank admin reads (slice 16)", () => {
  let admin: { id: string };
  let trainee: { id: string };
  let lesson: { id: string };
  let quiz: { id: string };
  let adminSession: Session;

  beforeAll(async () => {
    admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    adminSession = sessionFor(admin.id, "ADMIN");
    const fixture = await createEphemeralQuiz("سؤال 16: قوائم بنك الأسئلة", 600);
    lesson = fixture.lesson;
    quiz = fixture.quiz;
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
  });

  it("is Admin-only and 404s unknown ids", async () => {
    await expect(listQuizQuestions(null, quiz.id)).rejects.toThrow(UnauthenticatedError);
    await expect(listQuizQuestions(sessionFor(trainee.id, "TRAINEE"), quiz.id)).rejects.toThrow(ForbiddenError);
    await expect(listQuizQuestions(adminSession, "no-such-quiz")).rejects.toThrow(NotFoundError);
    await expect(getQuestionForAdmin(sessionFor(trainee.id, "TRAINEE"), "x")).rejects.toThrow(ForbiddenError);
    await expect(getQuestionForAdmin(adminSession, "no-such-question")).rejects.toThrow(NotFoundError);
  });

  it("returns every question regardless of status, with quiz meta", async () => {
    const view = await listQuizQuestions(adminSession, quiz.id);
    expect(view.title).toContain("سؤال 16: قوائم بنك الأسئلة");
    expect(view.lesson.unit.name).toBe("أول مكالمة");
    expect(view.questions).toHaveLength(2); // both fixture questions, APPROVED
    expect(view.questions.every((q) => q.status === "APPROVED")).toBe(true);

    const question = await getQuestionForAdmin(adminSession, view.questions[0].id);
    expect(question.quiz.id).toBe(quiz.id);
    expect(question.correctOption).not.toBeNull(); // admin read is unredacted by design
  });
});
