import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError } from "@/lib/errors";
import { markLessonComplete } from "@/lib/content/lesson-completion";
import { assignTraineeSector } from "@/lib/admin/assign-sector";
import { startAttempt } from "./start-attempt";
import { saveAnswers } from "./save-answers";
import { submitAttempt } from "./submit-attempt";
import { getAttemptForTrainee } from "./attempt-view";
import { getQuizOutcome } from "./outcome";
import { createEphemeralQuiz, deleteEphemeralQuiz } from "./attempt-test-fixtures";

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

// Open item #2 (CLAUDE.md, resolved 2026-07-22): reassigning a trainee away
// from a sector never deletes their progress there — it becomes
// inaccessible while they're not currently assigned to it, and is fully
// restored (exact state, including attempt-cap consumption) if they're
// reassigned back. This exercises exactly that scenario end to end: attempt
// 1 used in sector A, reassign away, confirm inaccessible (reads AND
// writes), reassign back, confirm exact state (1 of 2 attempts) is
// restored — not a reset cap.
//
// Uses a dedicated throwaway trainee, never the shared trainee@example.com
// fixture: this test mutates sectorId, and other test files running
// concurrently assume that fixture stays in الخدمات (see
// attempt-test-fixtures.ts's own concurrency note).
describe("sector reassignment: attempt access + cap restoration (open item #2)", () => {
  let trainee: { id: string };
  let admin: { id: string };
  let lesson: { id: string };
  let quiz: { id: string };
  let servicesSectorId: string;
  let retailSectorId: string;
  let traineeSession: Session;
  let adminSession: Session;

  beforeAll(async () => {
    const services = await prisma.sector.findUniqueOrThrow({ where: { name: "الخدمات" } });
    const retail = await prisma.sector.findUniqueOrThrow({ where: { name: "التجزئة" } });
    servicesSectorId = services.id;
    retailSectorId = retail.id;

    admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    adminSession = sessionFor(admin.id, "ADMIN");

    trainee = await prisma.user.upsert({
      where: { email: "sector-reassignment-fixture@example.com" },
      update: { sectorId: servicesSectorId },
      create: { email: "sector-reassignment-fixture@example.com", role: "TRAINEE", sectorId: servicesSectorId },
    });
    traineeSession = sessionFor(trainee.id, "TRAINEE");

    // createEphemeralQuiz's fixture unit (أول مكالمة) lives under الخدمات.
    const fixture = await createEphemeralQuiz("سؤال: إعادة تعيين القطاع أثناء البرنامج", 600);
    lesson = fixture.lesson;
    quiz = fixture.quiz;
    await markLessonComplete(traineeSession, lesson.id);
  });

  afterAll(async () => {
    await deleteEphemeralQuiz(lesson.id);
    await prisma.auditLog.deleteMany({ where: { targetType: "User", targetId: trainee.id } });
    await prisma.user.deleteMany({ where: { email: "sector-reassignment-fixture@example.com" } });
  });

  it("restores exact attempt-cap state after a reassignment away and back", async () => {
    // 1. Attempt 1 used (submitted, one of two consumed) while in الخدمات.
    const attempt1 = await startAttempt(traineeSession, quiz.id);
    const questions = await prisma.attemptAnswer.findMany({ where: { attemptId: attempt1.id } });
    await saveAnswers(
      traineeSession,
      attempt1.id,
      questions.map((q) => ({ questionId: q.questionId!, selectedOption: "a" })),
    );
    await submitAttempt(traineeSession, attempt1.id);

    const before = await getQuizOutcome(traineeSession, quiz.id);
    expect(before.attemptsUsed).toBe(1);
    expect(before.attemptsAllowed).toBe(2);

    // Sanity: accessible before reassignment.
    await expect(getAttemptForTrainee(traineeSession, attempt1.id)).resolves.toBeDefined();

    // 2. Reassign away to التجزئة.
    await assignTraineeSector(adminSession, trainee.id, retailSectorId);

    // 3. Inaccessible while away — both reads and writes, not just outcome.
    await expect(getQuizOutcome(traineeSession, quiz.id)).rejects.toThrow(ForbiddenError);
    await expect(getAttemptForTrainee(traineeSession, attempt1.id)).rejects.toThrow(ForbiddenError);
    await expect(saveAnswers(traineeSession, attempt1.id, [])).rejects.toThrow(ForbiddenError);
    await expect(submitAttempt(traineeSession, attempt1.id)).rejects.toThrow(ForbiddenError);
    await expect(startAttempt(traineeSession, quiz.id)).rejects.toThrow(ForbiddenError);

    // Progress was never deleted — only inaccessible from outside الخدمات.
    const stillThere = await prisma.attempt.findUnique({ where: { id: attempt1.id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere?.status).toBe("SUBMITTED");

    // 4. Reassign back to الخدمات.
    await assignTraineeSector(adminSession, trainee.id, servicesSectorId);

    // 5. Exact state restored: 1 of 2 attempts, not a reset cap.
    const after = await getQuizOutcome(traineeSession, quiz.id);
    expect(after.attemptsUsed).toBe(1);
    expect(after.attemptsAllowed).toBe(2);
    await expect(getAttemptForTrainee(traineeSession, attempt1.id)).resolves.toBeDefined();

    // Starting again continues the sequence as attempt 2, not a fresh 1.
    const attempt2 = await startAttempt(traineeSession, quiz.id);
    expect(attempt2.attemptNumber).toBe(2);
  });
});
