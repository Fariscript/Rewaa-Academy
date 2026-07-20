import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { createEphemeralQuiz, deleteEphemeralQuiz } from "@/lib/quiz/attempt-test-fixtures";
import { createQuestion, editQuestion, retireQuestion } from "./manage";
import { approveQuestion } from "./approve";

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

const validContent = {
  type: "MCQ",
  prompt: "سؤال يدوي صالح",
  options: [
    { id: "a", text: "أ" },
    { id: "b", text: "ب" },
  ],
  correctOption: "a",
};

describe("createQuestion / editQuestion / retireQuestion", () => {
  let lesson: { id: string };
  let quiz: { id: string };
  let admin: { id: string };

  beforeAll(async () => {
    admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    const fixture = await createEphemeralQuiz("سؤال 5د: إدارة يدوية", 600);
    lesson = fixture.lesson;
    quiz = fixture.quiz;
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
  });

  describe("createQuestion", () => {
    it("rejects non-admin callers", async () => {
      await expect(createQuestion(sessionFor("caller", "TRAINEE"), quiz.id, validContent)).rejects.toThrow(
        ForbiddenError,
      );
    });

    it("404s on an unknown quiz", async () => {
      await expect(
        createQuestion(sessionFor(admin.id, "ADMIN"), "does-not-exist", validContent),
      ).rejects.toThrow(NotFoundError);
    });

    it("rejects invalid content without persisting anything", async () => {
      const before = await prisma.question.count({ where: { quizId: quiz.id } });
      await expect(
        createQuestion(sessionFor(admin.id, "ADMIN"), quiz.id, { ...validContent, correctOption: "z" }),
      ).rejects.toThrow(ForbiddenError);
      const after = await prisma.question.count({ where: { quizId: quiz.id } });
      expect(after).toBe(before);
    });

    it("creates a DRAFT/MANUAL question with createdById set", async () => {
      const question = await createQuestion(sessionFor(admin.id, "ADMIN"), quiz.id, validContent);
      expect(question.status).toBe("DRAFT");
      expect(question.source).toBe("MANUAL");
      expect(question.createdById).toBe(admin.id);
    });
  });

  describe("editQuestion", () => {
    it("rejects non-admin callers", async () => {
      const question = await createQuestion(sessionFor(admin.id, "ADMIN"), quiz.id, validContent);
      await expect(
        editQuestion(sessionFor("caller", "TRAINEE"), question.id, validContent),
      ).rejects.toThrow(ForbiddenError);
    });

    it("404s on an unknown question", async () => {
      await expect(
        editQuestion(sessionFor(admin.id, "ADMIN"), "does-not-exist", validContent),
      ).rejects.toThrow(NotFoundError);
    });

    it("resets an APPROVED question to DRAFT, clears approver, and archives the prior content as a revision", async () => {
      const question = await createQuestion(sessionFor(admin.id, "ADMIN"), quiz.id, validContent);
      const approved = await approveQuestion(sessionFor(admin.id, "ADMIN"), question.id);
      expect(approved.status).toBe("APPROVED");

      const newContent = { ...validContent, prompt: "سؤال معدّل" };
      const edited = await editQuestion(sessionFor(admin.id, "ADMIN"), question.id, newContent);
      expect(edited.status).toBe("DRAFT");
      expect(edited.approvedById).toBeNull();
      expect(edited.approvedAt).toBeNull();
      expect(edited.prompt).toBe("سؤال معدّل");

      const revisions = await prisma.questionRevision.findMany({ where: { questionId: question.id } });
      expect(revisions).toHaveLength(1);
      expect(revisions[0].prompt).toBe(validContent.prompt); // the pre-edit content
      expect(revisions[0].status).toBe("APPROVED"); // status at the time of the edit
      expect(revisions[0].editedById).toBe(admin.id);
    });

    it("rejects invalid content without mutating the question or writing a revision", async () => {
      const question = await createQuestion(sessionFor(admin.id, "ADMIN"), quiz.id, validContent);
      await expect(
        editQuestion(sessionFor(admin.id, "ADMIN"), question.id, { ...validContent, options: [] }),
      ).rejects.toThrow(ForbiddenError);

      const unchanged = await prisma.question.findUniqueOrThrow({ where: { id: question.id } });
      expect(unchanged.prompt).toBe(validContent.prompt);
      const revisions = await prisma.questionRevision.count({ where: { questionId: question.id } });
      expect(revisions).toBe(0);
    });

    it("refuses to edit a RETIRED or REJECTED question", async () => {
      const question = await createQuestion(sessionFor(admin.id, "ADMIN"), quiz.id, validContent);
      await retireQuestion(sessionFor(admin.id, "ADMIN"), question.id);
      await expect(editQuestion(sessionFor(admin.id, "ADMIN"), question.id, validContent)).rejects.toThrow(
        ForbiddenError,
      );
    });

    it("actually clears options/correctOption when editing an MCQ into a FREE_TEXT (not left stale)", async () => {
      const question = await createQuestion(sessionFor(admin.id, "ADMIN"), quiz.id, validContent);
      expect(question.options).not.toBeNull();

      const edited = await editQuestion(sessionFor(admin.id, "ADMIN"), question.id, {
        type: "FREE_TEXT",
        prompt: "سؤال حر بعد التعديل",
      });
      expect(edited.type).toBe("FREE_TEXT");
      expect(edited.options).toBeNull();
      expect(edited.correctOption).toBeNull();
    });
  });

  describe("retireQuestion", () => {
    it("rejects non-admin callers", async () => {
      const question = await createQuestion(sessionFor(admin.id, "ADMIN"), quiz.id, validContent);
      await expect(retireQuestion(sessionFor("caller", "TRAINEE"), question.id)).rejects.toThrow(
        ForbiddenError,
      );
    });

    it("retires a DRAFT or APPROVED question and audits it", async () => {
      const draft = await createQuestion(sessionFor(admin.id, "ADMIN"), quiz.id, validContent);
      const retiredDraft = await retireQuestion(sessionFor(admin.id, "ADMIN"), draft.id);
      expect(retiredDraft.status).toBe("RETIRED");

      const audit = await prisma.auditLog.findFirst({
        where: { action: "question_retired", targetId: draft.id },
      });
      expect(audit).toBeDefined();

      const approvedQuestion = await createQuestion(sessionFor(admin.id, "ADMIN"), quiz.id, validContent);
      await approveQuestion(sessionFor(admin.id, "ADMIN"), approvedQuestion.id);
      const retiredApproved = await retireQuestion(sessionFor(admin.id, "ADMIN"), approvedQuestion.id);
      expect(retiredApproved.status).toBe("RETIRED");
    });

    it("refuses to retire an already-RETIRED or REJECTED question", async () => {
      const question = await createQuestion(sessionFor(admin.id, "ADMIN"), quiz.id, validContent);
      await retireQuestion(sessionFor(admin.id, "ADMIN"), question.id);
      await expect(retireQuestion(sessionFor(admin.id, "ADMIN"), question.id)).rejects.toThrow(ForbiddenError);
    });
  });
});
