import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { startAttempt } from "@/lib/quiz/start-attempt";
import { createEphemeralQuiz, deleteEphemeralQuiz } from "@/lib/quiz/attempt-test-fixtures";
import { markLessonComplete } from "./lesson-completion";
import { getMyLearningHome, getMyLesson } from "./trainee-progress";

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

describe("getMyLearningHome / getMyLesson (FR-13 + T-7/T-8 read model)", () => {
  let trainee: { id: string };
  let lesson: { id: string };
  let quiz: { id: string };
  let session: Session;
  let unassigned: { id: string };

  beforeAll(async () => {
    trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    session = sessionFor(trainee.id, "TRAINEE");
    const fixture = await createEphemeralQuiz("سؤال 11: الصفحة الرئيسية للمتدرب", 600);
    lesson = fixture.lesson;
    quiz = fixture.quiz;
    unassigned = await prisma.user.create({
      data: { email: "unassigned-slice11@example.com", name: "بدون قطاع", role: "TRAINEE" },
    });
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
    await prisma.user.delete({ where: { id: unassigned.id } }).catch(() => {});
  });

  it("requires authentication", async () => {
    await expect(getMyLearningHome(null)).rejects.toThrow(UnauthenticatedError);
    await expect(getMyLesson(null, lesson.id)).rejects.toThrow(UnauthenticatedError);
  });

  it("returns null for a trainee with no sector assigned yet (FR-07)", async () => {
    expect(await getMyLearningHome(sessionFor(unassigned.id, "TRAINEE"))).toBeNull();
  });

  it("scopes getMyLesson to the caller's sector and 404s unknown lessons (NFR-02)", async () => {
    await expect(getMyLesson(session, "no-such-lesson")).rejects.toThrow(NotFoundError);

    // Any lesson from a sector other than the trainee's seeded الخدمات.
    const foreign = await prisma.lesson.findFirstOrThrow({
      where: { unit: { subSector: { sector: { name: { not: "الخدمات" } } } } },
    });
    await expect(getMyLesson(session, foreign.id)).rejects.toThrow(ForbiddenError);
  });

  it("reflects completion, unlock, and outcome transitions in both reads", async () => {
    // Before completing the lesson: present, locked, NOT_STARTED.
    let home = await getMyLearningHome(session);
    expect(home).not.toBeNull();
    expect(home!.sector.name).toBe("الخدمات");
    let row = home!.subSectors
      .flatMap((s) => s.units)
      .flatMap((u) => u.lessons)
      .find((l) => l.lessonId === lesson.id);
    expect(row).toBeDefined();
    expect(row!.completed).toBe(false);
    expect(row!.quiz).not.toBeNull();
    expect(row!.quiz!.unlocked).toBe(false);
    expect(row!.quiz!.outcome.status).toBe("NOT_STARTED");
    expect(row!.quiz!.inProgressAttemptId).toBeNull();

    // Completing unlocks; starting flips the outcome and exposes the
    // resumable attempt id.
    await markLessonComplete(session, lesson.id);
    const attempt = await startAttempt(session, quiz.id);

    home = await getMyLearningHome(session);
    row = home!.subSectors
      .flatMap((s) => s.units)
      .flatMap((u) => u.lessons)
      .find((l) => l.lessonId === lesson.id);
    expect(row!.completed).toBe(true);
    expect(row!.quiz!.unlocked).toBe(true);
    expect(row!.quiz!.outcome.status).toBe("IN_PROGRESS");
    expect(row!.quiz!.inProgressAttemptId).toBe(attempt.id);

    const lessonView = await getMyLesson(session, lesson.id);
    expect(lessonView.title).toBe("سؤال 11: الصفحة الرئيسية للمتدرب");
    expect(lessonView.unitName).toBe("أول مكالمة");
    expect(lessonView.completed).toBe(true);
    expect(lessonView.quiz!.inProgressAttemptId).toBe(attempt.id);
    expect(lessonView.quiz!.outcome.attemptsAllowed).toBe(2);
  });

  it("lazily auto-submits an expired open attempt during the home read (T-32)", async () => {
    const open = await prisma.attempt.findFirstOrThrow({
      where: { quizId: quiz.id, userId: trainee.id, status: "IN_PROGRESS" },
    });
    await prisma.attempt.update({ where: { id: open.id }, data: { startedAt: new Date(Date.now() - 700_000) } });

    const home = await getMyLearningHome(session);
    const row = home!.subSectors
      .flatMap((s) => s.units)
      .flatMap((u) => u.lessons)
      .find((l) => l.lessonId === lesson.id);
    expect(row!.quiz!.inProgressAttemptId).toBeNull();
    expect(row!.quiz!.outcome.attemptsUsed).toBe(1);
    expect(row!.quiz!.outcome.status).toBe("IN_PROGRESS"); // retry still available

    const finalized = await prisma.attempt.findUniqueOrThrow({ where: { id: open.id } });
    expect(finalized.status).toBe("AUTO_SUBMITTED");
  });
});
