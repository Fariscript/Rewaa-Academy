import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { syncExpiry } from "./attempt-lifecycle";

export interface AnswerInput {
  questionId: string;
  selectedOption: string | null;
}

// T-32: incremental saves are what makes "auto-submits the trainee's
// current answers" meaningful — without this, an expired attempt would
// have nothing to auto-submit.
export async function saveAnswers(session: Session | null, attemptId: string, answers: AnswerInput[]) {
  if (!session?.user) throw new UnauthenticatedError();

  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId } });
  if (!attempt) throw new NotFoundError("Attempt not found");
  if (attempt.userId !== session.user.id) throw new ForbiddenError();

  const synced = await syncExpiry(attemptId);
  if (synced.status !== "IN_PROGRESS") {
    throw new ForbiddenError("Attempt is already finalized");
  }

  await Promise.all(
    answers.map((a) =>
      prisma.attemptAnswer.updateMany({
        where: { attemptId, questionId: a.questionId },
        data: { selectedOption: a.selectedOption },
      }),
    ),
  );

  return prisma.attempt.findUniqueOrThrow({ where: { id: attemptId }, include: { answers: true } });
}
