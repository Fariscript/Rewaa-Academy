import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { createEphemeralQuiz, deleteEphemeralQuiz } from "@/lib/quiz/attempt-test-fixtures";
import { approveQuestion, rejectQuestion } from "./approve";

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

async function createDraftQuestion(quizId: string) {
  return prisma.question.create({
    data: {
      quizId,
      type: "MCQ",
      prompt: "سؤال مسودة",
      options: [
        { id: "a", text: "أ" },
        { id: "b", text: "ب" },
      ],
      correctOption: "a",
    },
  });
}

describe("approveQuestion / rejectQuestion (POST /api/admin/questions/:id/approve|reject)", () => {
  let lesson: { id: string };
  let quiz: { id: string };
  let admin: { id: string };

  beforeAll(async () => {
    admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    const fixture = await createEphemeralQuiz("سؤال 5ج: موافقة", 600);
    lesson = fixture.lesson;
    quiz = fixture.quiz;
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
  });

  it("rejects non-admin callers for both actions", async () => {
    const question = await createDraftQuestion(quiz.id);
    await expect(approveQuestion(sessionFor("caller", "TRAINEE"), question.id)).rejects.toThrow(ForbiddenError);
    await expect(rejectQuestion(sessionFor("caller", "TRAINEE"), question.id)).rejects.toThrow(ForbiddenError);
  });

  it("404s on an unknown question", async () => {
    await expect(approveQuestion(sessionFor(admin.id, "ADMIN"), "does-not-exist")).rejects.toThrow(NotFoundError);
    await expect(rejectQuestion(sessionFor(admin.id, "ADMIN"), "does-not-exist")).rejects.toThrow(NotFoundError);
  });

  it("approves a DRAFT question, sets approver/timestamp, and audits it", async () => {
    const question = await createDraftQuestion(quiz.id);
    const updated = await approveQuestion(sessionFor(admin.id, "ADMIN"), question.id);
    expect(updated.status).toBe("APPROVED");
    expect(updated.approvedById).toBe(admin.id);
    expect(updated.approvedAt).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { action: "question_approved", targetId: question.id },
    });
    expect(audit).toBeDefined();
    expect(audit?.actorId).toBe(admin.id);
  });

  it("refuses to approve or reject a question that isn't DRAFT", async () => {
    const question = await createDraftQuestion(quiz.id);
    await approveQuestion(sessionFor(admin.id, "ADMIN"), question.id);

    await expect(approveQuestion(sessionFor(admin.id, "ADMIN"), question.id)).rejects.toThrow(ForbiddenError);
    await expect(rejectQuestion(sessionFor(admin.id, "ADMIN"), question.id)).rejects.toThrow(ForbiddenError);
  });

  it("rejects a DRAFT question permanently and audits it", async () => {
    const question = await createDraftQuestion(quiz.id);
    const updated = await rejectQuestion(sessionFor(admin.id, "ADMIN"), question.id);
    expect(updated.status).toBe("REJECTED");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "question_rejected", targetId: question.id },
    });
    expect(audit).toBeDefined();
  });
});
