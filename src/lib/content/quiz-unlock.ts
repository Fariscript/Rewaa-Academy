import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";

// T-7/T-8/T-33: a quiz is unlocked once its lesson is marked complete, and
// that state is computed on read rather than stored or pushed — there's no
// separate "unlock" flag to flip and nothing this function ever writes, so
// it can't itself launch an attempt (T-33) and needs no manual surfacing
// step (T-8).
//
// TODO(open-item-3, open-item-3b): this only checks the single lesson this
// quiz is attached to. Ownership of the lesson-complete -> unlock check
// (open-item-3) is largely moot under this reactive design, but open-item-3b
// (whether T-9 requires ordering across a sector's whole lesson sequence,
// not just this one lesson) is still open — pending CEO confirmation. If it
// resolves to "yes, ordered", this is the one place to add a prerequisite
// check; the computed-on-read shape doesn't need restructuring for that.
export async function isQuizUnlocked(session: Session | null, quizId: string): Promise<boolean> {
  if (!session?.user) throw new UnauthenticatedError();

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { lessonId: true, lesson: { select: { unit: { select: { subSector: { select: { sectorId: true } } } } } } },
  });
  if (!quiz) throw new NotFoundError("Quiz not found");

  const caller = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { sectorId: true },
  });
  if (!caller.sectorId || caller.sectorId !== quiz.lesson.unit.subSector.sectorId) {
    throw new ForbiddenError("Quiz is outside your assigned sector");
  }

  const completion = await prisma.lessonCompletion.findUnique({
    where: { userId_lessonId: { userId: session.user.id, lessonId: quiz.lessonId } },
  });

  return completion !== null;
}
