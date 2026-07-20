import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { createEphemeralQuiz, deleteEphemeralQuiz } from "@/lib/quiz/attempt-test-fixtures";
import { createQuestion, editQuestion } from "./manage";
import { listRevisions, restoreRevision } from "./revisions";

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

const v1 = {
  type: "MCQ",
  prompt: "النسخة الأولى",
  options: [
    { id: "a", text: "أ" },
    { id: "b", text: "ب" },
  ],
  correctOption: "a",
};

describe("listRevisions / restoreRevision", () => {
  let lesson: { id: string };
  let quiz: { id: string };
  let admin: { id: string };

  beforeAll(async () => {
    admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    const fixture = await createEphemeralQuiz("سؤال 5د: سجل النسخ", 600);
    lesson = fixture.lesson;
    quiz = fixture.quiz;
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
  });

  it("rejects non-admin callers for both actions", async () => {
    const question = await createQuestion(sessionFor(admin.id, "ADMIN"), quiz.id, v1);
    await expect(listRevisions(sessionFor("caller", "TRAINEE"), question.id)).rejects.toThrow(ForbiddenError);
    await expect(
      restoreRevision(sessionFor("caller", "TRAINEE"), question.id, "whatever"),
    ).rejects.toThrow(ForbiddenError);
  });

  it("404s when a revision doesn't belong to the given question", async () => {
    const questionA = await createQuestion(sessionFor(admin.id, "ADMIN"), quiz.id, v1);
    const questionB = await createQuestion(sessionFor(admin.id, "ADMIN"), quiz.id, { ...v1, prompt: "سؤال ب" });
    await editQuestion(sessionFor(admin.id, "ADMIN"), questionA.id, { ...v1, prompt: "معدّل" });
    const [revisionOfA] = await listRevisions(sessionFor(admin.id, "ADMIN"), questionA.id);

    await expect(restoreRevision(sessionFor(admin.id, "ADMIN"), questionB.id, revisionOfA.id)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("lists revisions newest-first and restore re-enters the edit path (archives current, applies old, resets to DRAFT)", async () => {
    const question = await createQuestion(sessionFor(admin.id, "ADMIN"), quiz.id, v1);
    await editQuestion(sessionFor(admin.id, "ADMIN"), question.id, { ...v1, prompt: "النسخة الثانية" });
    await editQuestion(sessionFor(admin.id, "ADMIN"), question.id, { ...v1, prompt: "النسخة الثالثة" });

    const revisions = await listRevisions(sessionFor(admin.id, "ADMIN"), question.id);
    expect(revisions).toHaveLength(2);
    expect(revisions[0].prompt).toBe("النسخة الثانية"); // most recent edit's prior content, first
    expect(revisions[1].prompt).toBe(v1.prompt);

    const targetRevision = revisions.find((r) => r.prompt === v1.prompt)!;
    const restored = await restoreRevision(sessionFor(admin.id, "ADMIN"), question.id, targetRevision.id);
    expect(restored.prompt).toBe(v1.prompt);
    expect(restored.status).toBe("DRAFT");

    // Restoring is itself an edit: it archived "النسخة الثالثة" as a new revision.
    const revisionsAfterRestore = await listRevisions(sessionFor(admin.id, "ADMIN"), question.id);
    expect(revisionsAfterRestore).toHaveLength(3);
    expect(revisionsAfterRestore[0].prompt).toBe("النسخة الثالثة");
  });
});
