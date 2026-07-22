import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { getQuizOutcome } from "@/lib/quiz/outcome";

// T-7/T-8/T-33: a quiz is unlocked once its lesson is marked complete, and
// that state is computed on read rather than stored or pushed — there's no
// separate "unlock" flag to flip and nothing this function ever writes, so
// it can't itself launch an attempt (T-33) and needs no manual surfacing
// step (T-8).
//
// Open items #3/#3b (RESOLVED 2026-07-22, see CLAUDE.md): the check also
// requires the PREVIOUS lesson in the trainee's current chain (same Unit,
// per this session's corroborated finding — see "Handoff to Ibrahim's
// track") to have its own quiz PASSED, not merely completed, before this
// one unlocks. Chain-scoped, not sector-wide: a lesson in an unrelated
// Unit is never affected by a failure elsewhere (the owner's example: a
// Zoho CRM lesson is unaffected by a failed call-skills chain). If the
// previous lesson has no quiz of its own, its completion alone is the
// prerequisite (unchanged single-lesson behavior one step back).
//
// Ordering caveat, flagged not silently assumed: Lesson has no explicit
// order field yet — createdAt is the only signal today, a stand-in
// pending a real ordering field from Ibrahim's content system (see
// CLAUDE.md's "Handoff to Ibrahim's track" — not modeled here).
export async function isQuizUnlocked(session: Session | null, quizId: string): Promise<boolean> {
  if (!session?.user) throw new UnauthenticatedError();

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: {
      lessonId: true,
      lesson: { select: { unitId: true, unit: { select: { subSector: { select: { sectorId: true } } } } } },
    },
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
  if (completion === null) return false;

  const chainLessons = await prisma.lesson.findMany({
    where: { unitId: quiz.lesson.unitId },
    orderBy: { createdAt: "asc" },
    select: { id: true, quiz: { select: { id: true } } },
  });
  const position = chainLessons.findIndex((l) => l.id === quiz.lessonId);
  const previous = position > 0 ? chainLessons[position - 1] : null;

  if (previous) {
    if (previous.quiz) {
      const previousOutcome = await getQuizOutcome(session, previous.quiz.id);
      if (!previousOutcome.passed) return false;
    } else {
      const previousCompletion = await prisma.lessonCompletion.findUnique({
        where: { userId_lessonId: { userId: session.user.id, lessonId: previous.id } },
      });
      if (!previousCompletion) return false;
    }
  }

  return true;
}
