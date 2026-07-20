import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMyLesson, type LearningHomeQuiz } from "@/lib/content/trainee-progress";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { QUIZ_STATUS_LABELS } from "@/lib/content/labels";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { BUTTON_CLASSES } from "@/components/ui/button";
import { CompleteLessonButton } from "@/components/lessons/complete-lesson-button";
import { StartQuizButton } from "@/components/quiz/start-quiz-button";

function formatMinutes(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (seconds === 0) return `${minutes} دقيقة`;
  return `${minutes} دقيقة و${seconds} ثانية`;
}

function QuizCard({ quiz }: { quiz: LearningHomeQuiz }) {
  const { outcome } = quiz;

  if (!quiz.unlocked) {
    return (
      <Card>
        <h2 className="mb-1 font-bold">{quiz.title}</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          أكمل الدرس أولاً ليصبح الاختبار متاحاً.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">{quiz.title}</h2>
        <Badge
          variant={
            outcome.status === "PASSED" ? "success" : outcome.status === "AWAITING_MANUAL_GRADE" ? "warning" : "neutral"
          }
        >
          {QUIZ_STATUS_LABELS[outcome.status]}
        </Badge>
      </div>
      <p className="mb-3 text-sm text-neutral-500 dark:text-neutral-400">
        مدة الاختبار: <span dir="ltr">{formatMinutes(quiz.timeLimitSeconds)}</span> · المحاولات المستخدمة:{" "}
        <span dir="ltr">
          {outcome.attemptsUsed}/{outcome.attemptsAllowed}
        </span>
        {outcome.bestScore !== null ? (
          <>
            {" "}
            · أفضل نتيجة: <span dir="ltr">{outcome.bestScore}%</span>
          </>
        ) : null}
      </p>

      {quiz.inProgressAttemptId ? (
        <Link href={`/attempts/${quiz.inProgressAttemptId}`} className={BUTTON_CLASSES.primary}>
          استئناف المحاولة الجارية
        </Link>
      ) : outcome.status === "PASSED" ? (
        <Link href={`/quizzes/${quiz.quizId}/result`} className={BUTTON_CLASSES.secondary}>
          عرض النتيجة
        </Link>
      ) : outcome.status === "AWAITING_MANUAL_GRADE" ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          إجاباتك قيد التصحيح، وستظهر النتيجة النهائية بعد اعتمادها.
        </p>
      ) : outcome.status === "FAILED_FINAL_ATTEMPT" ? (
        // Open item #1: no consequence is decided for failing both attempts —
        // state the fact neutrally, promise nothing.
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">استُنفدت محاولات هذا الاختبار.</p>
          <Link href={`/quizzes/${quiz.quizId}/result`} className={BUTTON_CLASSES.subtle}>
            عرض النتيجة
          </Link>
        </div>
      ) : !quiz.hasApprovedQuestions ? (
        // T-12: no approved questions yet — startAttempt would refuse.
        <p className="text-sm text-neutral-500 dark:text-neutral-400">الاختبار غير متاح بعد.</p>
      ) : (
        <StartQuizButton
          quizId={quiz.quizId}
          label={outcome.attemptsUsed > 0 ? "ابدأ المحاولة التالية" : "ابدأ الاختبار"}
        />
      )}
    </Card>
  );
}

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  let lesson;
  try {
    lesson = await getMyLesson(session, id);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) notFound();
    throw error;
  }

  return (
    <div>
      <div className="mb-4">
        <Link href="/" className="text-sm text-neutral-500 hover:underline dark:text-neutral-400">
          → العودة إلى مكتبة المعرفة
        </Link>
      </div>
      <PageHeader title={lesson.title} description={`${lesson.subSectorName} · ${lesson.unitName}`} />

      <div className="flex flex-col gap-4">
        <Card>
          {/* FR-12: the lesson body (video/PDF/article) lives in the content
              system — this engine only tracks completion. */}
          <p className="mb-4 text-neutral-500 dark:text-neutral-400">
            محتوى الدرس يُدار في نظام المحتوى وسيظهر هنا عند ربطه.
          </p>
          {lesson.completed ? (
            <Badge variant="success">أكملت هذا الدرس</Badge>
          ) : (
            <CompleteLessonButton lessonId={lesson.lessonId} />
          )}
        </Card>

        {lesson.quiz ? <QuizCard quiz={lesson.quiz} /> : null}
      </div>
    </div>
  );
}
