import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createEphemeralQuiz, deleteEphemeralQuiz } from "@/lib/quiz/attempt-test-fixtures";

// Slice 5a: schema-only smoke test for status/source/versioning fields.
// Real behavioral coverage comes from 5b-5e's service-level tests.
describe("Question status/source/versioning schema", () => {
  let lesson: { id: string };
  let quiz: { id: string };

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
  });

  it("defaults a new question to DRAFT/MANUAL and supports a revision + approval trail", async () => {
    const fixture = await createEphemeralQuiz("سؤال 5أ: فحص المخطط", 600);
    lesson = fixture.lesson;
    quiz = fixture.quiz;
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });

    const question = await prisma.question.create({
      data: {
        quizId: quiz.id,
        type: "MCQ",
        prompt: "سؤال تجريبي",
        options: [
          { id: "a", text: "أ" },
          { id: "b", text: "ب" },
        ],
        correctOption: "a",
      },
    });
    expect(question.status).toBe("DRAFT");
    expect(question.source).toBe("MANUAL");
    expect(question.createdById).toBeNull();
    expect(question.approvedById).toBeNull();

    const revision = await prisma.questionRevision.create({
      data: {
        questionId: question.id,
        type: question.type,
        prompt: question.prompt,
        options: question.options as object,
        correctOption: question.correctOption,
        status: question.status,
        editedById: admin.id,
      },
    });
    expect(revision.questionId).toBe(question.id);

    const approved = await prisma.question.update({
      where: { id: question.id },
      data: { status: "APPROVED", approvedById: admin.id, approvedAt: new Date() },
    });
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedById).toBe(admin.id);

    const withRevisions = await prisma.question.findUniqueOrThrow({
      where: { id: question.id },
      include: { revisions: true },
    });
    expect(withRevisions.revisions).toHaveLength(1);
  });
});
