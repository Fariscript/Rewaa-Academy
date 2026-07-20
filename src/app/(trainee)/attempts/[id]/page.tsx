import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAttemptForTrainee } from "@/lib/quiz/attempt-view";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { QuizRunner, type RunnerAttempt } from "@/components/quiz/quiz-runner";

// The quiz-taking screen. The server component reads the redacted attempt
// view (never the raw rows — RSC props reach the client) and hands the
// runner a JSON-safe projection. A finalized attempt redirects straight to
// the result page, which also covers "the timer ran out while the tab was
// closed": getAttemptForTrainee lazily auto-submits on read (T-32).
export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  let view;
  try {
    view = await getAttemptForTrainee(session, id);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) notFound();
    throw error;
  }

  if (view.status !== "IN_PROGRESS") redirect(`/quizzes/${view.quizId}/result`);

  const attempt: RunnerAttempt = {
    id: view.id,
    quizId: view.quizId,
    quizTitle: view.quizTitle,
    attemptNumber: view.attemptNumber,
    expiresAt: view.expiresAt.toISOString(),
    serverNow: view.serverNow.toISOString(),
    answers: view.answers.map((a) => ({
      questionId: a.questionId,
      questionPrompt: a.questionPrompt,
      questionType: a.questionType,
      options: Array.isArray(a.options) ? (a.options as { id: string; text: string }[]) : null,
      selectedOption: a.selectedOption,
      textAnswer: a.textAnswer,
    })),
  };

  return <QuizRunner attempt={attempt} />;
}
