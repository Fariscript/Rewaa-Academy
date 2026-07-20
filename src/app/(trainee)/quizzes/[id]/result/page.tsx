import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getQuizResultForTrainee, type TraineeAttemptView } from "@/lib/quiz/attempt-view";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { QUIZ_STATUS_LABELS } from "@/lib/content/labels";
import { formatDateTime } from "@/lib/dates";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { BUTTON_CLASSES } from "@/components/ui/button";
import { StartQuizButton } from "@/components/quiz/start-quiz-button";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  NOT_STARTED: "neutral",
  IN_PROGRESS: "info",
  AWAITING_MANUAL_GRADE: "warning",
  PASSED: "success",
  FAILED_FINAL_ATTEMPT: "neutral",
};

const ATTEMPT_STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: "جارية",
  SUBMITTED: "مُسلّمة",
  AUTO_SUBMITTED: "سُلّمت تلقائياً عند انتهاء الوقت",
  PENDING_MANUAL_GRADE: "بانتظار التصحيح",
};

function dateLabel(value: Date | null) {
  if (!value) return null;
  return formatDateTime(value);
}

function AttemptReview({ attempt }: { attempt: TraineeAttemptView }) {
  const finalized = attempt.status === "SUBMITTED" || attempt.status === "AUTO_SUBMITTED";
  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">
          المحاولة <span dir="ltr">{attempt.attemptNumber}</span>
        </h3>
        <div className="flex items-center gap-2">
          {attempt.score !== null ? (
            <span className="font-bold" dir="ltr">
              {attempt.score}%
            </span>
          ) : null}
          <Badge variant={attempt.status === "PENDING_MANUAL_GRADE" ? "warning" : "neutral"}>
            {ATTEMPT_STATUS_LABELS[attempt.status]}
          </Badge>
        </div>
      </div>
      {attempt.submittedAt ? (
        <p className="mb-3 text-sm text-neutral-500 dark:text-neutral-400">{dateLabel(attempt.submittedAt)}</p>
      ) : null}

      <ol className="flex flex-col gap-3">
        {attempt.answers.map((answer, index) => (
          <li key={answer.questionId ?? index} className="rounded-md bg-neutral-50 p-3 dark:bg-neutral-900">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{answer.questionPrompt}</p>
              {finalized || answer.isCorrect !== null ? (
                answer.isCorrect === null ? (
                  <Badge variant="warning">بانتظار التصحيح</Badge>
                ) : answer.isCorrect ? (
                  <Badge variant="success">صحيحة</Badge>
                ) : (
                  <Badge variant="danger">خاطئة</Badge>
                )
              ) : null}
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              إجابتك:{" "}
              {answer.selectedOption
                ? (Array.isArray(answer.options)
                    ? (answer.options as { id: string; text: string }[]).find((o) => o.id === answer.selectedOption)
                        ?.text
                    : null) ?? answer.selectedOption
                : answer.textAnswer?.trim()
                  ? answer.textAnswer
                  : "— لم تُجب"}
            </p>
            {answer.feedback ? (
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">ملاحظات المصحح: {answer.feedback}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}

export default async function QuizResultPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  let result;
  try {
    result = await getQuizResultForTrainee(session, id);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) notFound();
    throw error;
  }

  const { outcome } = result;
  const openAttempt = result.attempts.find((a) => a.status === "IN_PROGRESS");
  const canRetry =
    !openAttempt && !outcome.passed && outcome.status !== "AWAITING_MANUAL_GRADE" && outcome.attemptsUsed > 0 &&
    outcome.attemptsUsed < outcome.attemptsAllowed;

  return (
    <div>
      <div className="mb-4">
        <Link
          href={`/lessons/${result.lessonId}`}
          className="text-sm text-neutral-500 hover:underline dark:text-neutral-400"
        >
          → العودة إلى الدرس
        </Link>
      </div>
      <PageHeader title={result.quizTitle} />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <Badge variant={STATUS_VARIANTS[outcome.status]}>{QUIZ_STATUS_LABELS[outcome.status]}</Badge>
          {outcome.bestScore !== null ? (
            <p>
              أفضل نتيجة: <span className="font-bold" dir="ltr">{outcome.bestScore}%</span>{" "}
              <span className="text-sm text-neutral-500 dark:text-neutral-400">(النجاح من 95%)</span>
            </p>
          ) : null}
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            المحاولات المستخدمة:{" "}
            <span dir="ltr">
              {outcome.attemptsUsed}/{outcome.attemptsAllowed}
            </span>
          </p>
        </div>
        {outcome.status === "AWAITING_MANUAL_GRADE" ? (
          <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
            إجاباتك قيد التصحيح، وستظهر النتيجة النهائية بعد اعتمادها.
          </p>
        ) : null}
        {/* Open item #1: neutral — no consequence is decided for a both-failed quiz. */}
        {outcome.status === "FAILED_FINAL_ATTEMPT" ? (
          <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">استُنفدت محاولات هذا الاختبار.</p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3">
          {openAttempt ? (
            <Link href={`/attempts/${openAttempt.id}`} className={BUTTON_CLASSES.primary}>
              استئناف المحاولة الجارية
            </Link>
          ) : null}
          {canRetry ? <StartQuizButton quizId={result.quizId} label="ابدأ المحاولة التالية" /> : null}
        </div>
      </Card>

      <div className="flex flex-col gap-4">
        {result.attempts
          .filter((a) => a.status !== "IN_PROGRESS")
          .map((attempt) => (
            <AttemptReview key={attempt.id} attempt={attempt} />
          ))}
      </div>
    </div>
  );
}
