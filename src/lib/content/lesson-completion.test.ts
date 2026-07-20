import { afterAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { markLessonComplete } from "./lesson-completion";

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

describe("markLessonComplete (POST /api/lessons/:id/complete)", () => {
  afterAll(async () => {
    const trainee = await prisma.user.findUnique({ where: { email: "trainee@example.com" } });
    if (trainee) {
      await prisma.lessonCompletion.deleteMany({ where: { userId: trainee.id } });
    }
  });

  it("throws UnauthenticatedError with no session", async () => {
    await expect(markLessonComplete(null, "does-not-matter")).rejects.toThrow(UnauthenticatedError);
  });

  it("404s on an unknown lesson", async () => {
    const trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    await expect(markLessonComplete(sessionFor(trainee.id, "TRAINEE"), "does-not-exist")).rejects.toThrow(
      NotFoundError,
    );
  });

  it("rejects a lesson outside the caller's assigned sector", async () => {
    const trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } }); // assigned to الخدمات
    const otherSectorLesson = await prisma.lesson.findFirstOrThrow({
      where: { title: "الرد على اعتراض السعر" }, // lives under التجزئة
    });
    await expect(
      markLessonComplete(sessionFor(trainee.id, "TRAINEE"), otherSectorLesson.id),
    ).rejects.toThrow(ForbiddenError);
  });

  it("marks a lesson in the caller's own sector complete, persists, and is idempotent", async () => {
    const trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    const lesson = await prisma.lesson.findFirstOrThrow({ where: { title: "استقبال العميل" } });

    const first = await markLessonComplete(sessionFor(trainee.id, "TRAINEE"), lesson.id);
    expect(first.userId).toBe(trainee.id);
    expect(first.lessonId).toBe(lesson.id);

    const stored = await prisma.lessonCompletion.findUnique({
      where: { userId_lessonId: { userId: trainee.id, lessonId: lesson.id } },
    });
    expect(stored).not.toBeNull();

    // Idempotent: calling it again doesn't error or create a second row.
    await expect(markLessonComplete(sessionFor(trainee.id, "TRAINEE"), lesson.id)).resolves.toBeDefined();
    const count = await prisma.lessonCompletion.count({
      where: { userId: trainee.id, lessonId: lesson.id },
    });
    expect(count).toBe(1);
  });
});
