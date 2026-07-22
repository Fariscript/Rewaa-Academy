import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { assertTraineeSectorMatchesQuiz, syncExpiry } from "./attempt-lifecycle";

export interface AnswerInput {
  questionId: string;
  // MCQ/TRUE_FALSE:
  selectedOption?: string | null;
  // SCENARIO/FREE_TEXT/MOCK_CALL (T-18):
  textAnswer?: string | null;
}

// T-32: incremental saves are what makes "auto-submits the trainee's
// current answers" meaningful — without this, an expired attempt would
// have nothing to auto-submit.
export async function saveAnswers(session: Session | null, attemptId: string, answers: AnswerInput[]) {
  if (!session?.user) throw new UnauthenticatedError();

  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId } });
  if (!attempt) throw new NotFoundError("Attempt not found");
  if (attempt.userId !== session.user.id) throw new ForbiddenError();
  // Open item #2: reassigned away from this quiz's sector — inaccessible
  // (not deleted) until reassigned back. See attempt-lifecycle.ts.
  await assertTraineeSectorMatchesQuiz(session.user.id, attempt.quizId);

  const synced = await syncExpiry(attemptId);
  if (synced.status !== "IN_PROGRESS") {
    throw new ForbiddenError("Attempt is already finalized");
  }

  await Promise.all(
    answers.map((a) => {
      const data: { selectedOption?: string | null; textAnswer?: string | null } = {};
      if ("selectedOption" in a) data.selectedOption = a.selectedOption;
      if ("textAnswer" in a) data.textAnswer = a.textAnswer;
      return prisma.attemptAnswer.updateMany({
        where: { attemptId, questionId: a.questionId },
        data,
      });
    }),
  );

  return prisma.attempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: { answers: { orderBy: { id: "asc" } }, quiz: true },
  });
}
