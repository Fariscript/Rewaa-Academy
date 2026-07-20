import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";

// T-7 (write half): mark a lesson complete for the caller. Scoped to the
// caller's own assigned sector — same server-side scoping as FR-13's
// content read (NFR-02) — and idempotent, since a trainee revisiting a
// lesson shouldn't error.
export async function markLessonComplete(session: Session | null, lessonId: string) {
  if (!session?.user) throw new UnauthenticatedError();

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, unit: { select: { subSector: { select: { sectorId: true } } } } },
  });
  if (!lesson) throw new NotFoundError("Lesson not found");

  const caller = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { sectorId: true },
  });

  if (!caller.sectorId || caller.sectorId !== lesson.unit.subSector.sectorId) {
    throw new ForbiddenError("Lesson is outside your assigned sector");
  }

  return prisma.lessonCompletion.upsert({
    where: { userId_lessonId: { userId: session.user.id, lessonId } },
    update: {},
    create: { userId: session.user.id, lessonId },
  });
}
