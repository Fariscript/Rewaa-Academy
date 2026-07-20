import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, AiProviderError } from "@/lib/errors";
import { createEphemeralQuiz, deleteEphemeralQuiz } from "@/lib/quiz/attempt-test-fixtures";
import { draftQuestions } from "./draft";
import type { AiQuestionDrafter } from "@/lib/ai/drafter";

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

const validCandidate = {
  type: "MCQ",
  prompt: "سؤال صالح للاختبار",
  options: [
    { id: "a", text: "أ" },
    { id: "b", text: "ب" },
  ],
  correctOption: "a",
};

describe("draftQuestions (POST /api/admin/quizzes/:id/questions/draft)", () => {
  let lesson: { id: string };
  let quiz: { id: string };
  let admin: { id: string };

  beforeAll(async () => {
    admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    const fixture = await createEphemeralQuiz("سؤال 5ب: مسودة الذكاء الاصطناعي", 600);
    lesson = fixture.lesson;
    quiz = fixture.quiz;
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
  });

  it("rejects non-admin callers", async () => {
    const fakeDrafter: AiQuestionDrafter = async () => [validCandidate];
    await expect(
      draftQuestions(sessionFor("caller", "TRAINEE"), quiz.id, 1, fakeDrafter),
    ).rejects.toThrow(ForbiddenError);
  });

  it("creates valid candidates as DRAFT/AI_DRAFT and skips malformed ones without persisting them", async () => {
    const mixedDrafter: AiQuestionDrafter = async () => [
      validCandidate,
      { type: "ESSAY", prompt: "سؤال", options: [{ id: "a", text: "أ" }], correctOption: "a" }, // unsupported type
      { type: "MCQ", prompt: "", options: [{ id: "a", text: "أ" }], correctOption: "a" }, // empty prompt
      { type: "MCQ", prompt: "سؤال", options: [], correctOption: "a" }, // empty options
      { type: "MCQ", prompt: "سؤال", options: [{ id: "a", text: "أ" }], correctOption: "z" }, // mismatched correctOption
      {
        type: "TRUE_FALSE",
        prompt: "سؤال صح/خطأ صالح",
        options: [
          { id: "true", text: "صحيح" },
          { id: "false", text: "خطأ" },
        ],
        correctOption: "false",
      },
    ];

    const before = await prisma.question.count({ where: { quizId: quiz.id } });
    const result = await draftQuestions(sessionFor(admin.id, "ADMIN"), quiz.id, 6, mixedDrafter);
    const after = await prisma.question.count({ where: { quizId: quiz.id } });

    expect(result.created).toHaveLength(2);
    expect(result.rejected).toHaveLength(4);
    expect(after - before).toBe(2); // exactly the valid ones were persisted, nothing more

    for (const question of result.created) {
      expect(question.status).toBe("DRAFT");
      expect(question.source).toBe("AI_DRAFT");
      expect(question.createdById).toBe(admin.id);
    }
    for (const rejection of result.rejected) {
      expect(rejection.reason).toBeTruthy();
    }

    const audit = await prisma.auditLog.findFirst({
      where: { action: "ai_draft_rejected", targetId: quiz.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeDefined();
    expect(audit?.actorId).toBe(admin.id);
    const metadata = audit?.metadata as { countRequested: number; countCreated: number; rejected: unknown[] };
    expect(metadata.countRequested).toBe(6);
    expect(metadata.countCreated).toBe(2);
    expect(metadata.rejected).toHaveLength(4);
  });

  it("does not audit-log when every candidate is valid", async () => {
    const cleanDrafter: AiQuestionDrafter = async () => [validCandidate];
    const before = await prisma.auditLog.count({ where: { action: "ai_draft_rejected", targetId: quiz.id } });
    await draftQuestions(sessionFor(admin.id, "ADMIN"), quiz.id, 1, cleanDrafter);
    const after = await prisma.auditLog.count({ where: { action: "ai_draft_rejected", targetId: quiz.id } });
    expect(after).toBe(before);
  });

  it("surfaces a throwing drafter as AiProviderError and persists nothing", async () => {
    const throwingDrafter: AiQuestionDrafter = async () => {
      throw new Error("simulated timeout");
    };
    const before = await prisma.question.count({ where: { quizId: quiz.id } });
    await expect(draftQuestions(sessionFor(admin.id, "ADMIN"), quiz.id, 3, throwingDrafter)).rejects.toThrow(
      AiProviderError,
    );
    const after = await prisma.question.count({ where: { quizId: quiz.id } });
    expect(after).toBe(before);
  });

  it("propagates an AiProviderError thrown by the drafter as-is", async () => {
    const drafter: AiQuestionDrafter = async () => {
      throw new AiProviderError("rate limited");
    };
    await expect(draftQuestions(sessionFor(admin.id, "ADMIN"), quiz.id, 1, drafter)).rejects.toThrow(
      "rate limited",
    );
  });
});
