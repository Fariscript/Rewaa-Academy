import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { getQuizOutcome } from "@/lib/quiz/outcome";
import { grantAutomaticFreshAttempts } from "@/lib/admin/attempt-override";

// T-7 (write half): mark a lesson complete for the caller. Scoped to the
// caller's own assigned sector — same server-side scoping as FR-13's
// content read (NFR-02).
//
// Open item #1 (RESOLVED 2026-07-22, see CLAUDE.md): a repeat call on an
// already-completed lesson used to be a pure no-op (idempotent, nothing
// recorded). It's now also the redo-loop's trigger: if the lesson's own
// quiz is currently FAILED_FINAL_ATTEMPT (both attempts used, not
// passed), a repeat call IS the "redo the lesson" event — it bumps
// completedAt and automatically grants a fresh 2-attempt window on that
// quiz (grantAutomaticFreshAttempts). A repeat call on a lesson that
// isn't currently stuck stays exactly the same harmless no-op as
// before — this only fires for a trainee actually breaking out of the
// loop, not on every re-visit.
export async function markLessonComplete(session: Session | null, lessonId: string) {
  if (!session?.user) throw new UnauthenticatedError();

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      unit: { select: { subSector: { select: { sectorId: true } } } },
      quiz: { select: { id: true } },
    },
  });
  if (!lesson) throw new NotFoundError("Lesson not found");

  const caller = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { sectorId: true },
  });

  if (!caller.sectorId || caller.sectorId !== lesson.unit.subSector.sectorId) {
    throw new ForbiddenError("Lesson is outside your assigned sector");
  }

  const existing = await prisma.lessonCompletion.findUnique({
    where: { userId_lessonId: { userId: session.user.id, lessonId } },
  });

  if (existing && lesson.quiz) {
    const outcome = await getQuizOutcome(session, lesson.quiz.id);
    if (outcome.status === "FAILED_FINAL_ATTEMPT") {
      await grantAutomaticFreshAttempts(session.user.id, lesson.quiz.id);
      return prisma.lessonCompletion.update({
        where: { userId_lessonId: { userId: session.user.id, lessonId } },
        data: { completedAt: new Date() },
      });
    }
  }

  return prisma.lessonCompletion.upsert({
    where: { userId_lessonId: { userId: session.user.id, lessonId } },
    update: {},
    create: { userId: session.user.id, lessonId },
  });
}
