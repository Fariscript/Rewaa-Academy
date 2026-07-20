import { auth } from "@/auth";
import { listPendingGrading } from "@/lib/grading/grading";
import { formatDateTime } from "@/lib/dates";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { GradeAnswerForm } from "@/components/admin/grade-answer-form";

const QUESTION_TYPE_LABELS: Record<string, string> = {
  SCENARIO: "سيناريو بيعي",
  FREE_TEXT: "إجابة حرة",
  MOCK_CALL: "مكالمة تجريبية",
};

// T-18/T-25: the manual-grading queue, grouped by attempt. Grading here is
// per answer; converting a fully-graded attempt into an overall result
// (T-26) is gated on open item #4 — the copy below says so honestly
// instead of pretending a final score exists.
export default async function AdminGradingPage() {
  const session = await auth();
  const pending = await listPendingGrading(session);

  const byAttempt = new Map<string, typeof pending>();
  for (const answer of pending) {
    const group = byAttempt.get(answer.attempt.id) ?? [];
    group.push(answer);
    byAttempt.set(answer.attempt.id, group);
  }

  return (
    <div>
      <PageHeader title="التصحيح" description="إجابات بحاجة إلى تقييم يدوي" />
      <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        بعد تقييم جميع إجابات المحاولة تبقى نتيجتها الإجمالية بانتظار اعتماد قاعدة الاحتساب النهائية، ولن
        تظهر للمتدرب كنتيجة نهائية بعد.
      </p>
      {byAttempt.size === 0 ? (
        <EmptyState title="لا توجد إجابات بانتظار التصحيح" />
      ) : (
        <div className="flex flex-col gap-4">
          {[...byAttempt.values()].map((answers) => {
            const attempt = answers[0].attempt;
            return (
              <Card key={attempt.id}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold">{attempt.user.name ?? attempt.user.email}</p>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      {attempt.quiz.title}
                      {attempt.submittedAt ? <> · سُلّمت {formatDateTime(attempt.submittedAt)}</> : null}
                    </p>
                  </div>
                  <span className="text-sm text-neutral-500 dark:text-neutral-400">
                    <span dir="ltr">{answers.length}</span> إجابة بانتظار التقييم
                  </span>
                </div>
                <div className="flex flex-col gap-4">
                  {answers.map((answer) => (
                    <div key={answer.id} className="rounded-md bg-neutral-50 p-3 dark:bg-neutral-900">
                      <p className="mb-1 text-sm text-neutral-500 dark:text-neutral-400">
                        {QUESTION_TYPE_LABELS[answer.questionType] ?? answer.questionType}
                      </p>
                      <p className="mb-2 font-medium">{answer.questionPrompt}</p>
                      <p className="whitespace-pre-wrap text-neutral-700 dark:text-neutral-200">
                        {answer.textAnswer?.trim() ? answer.textAnswer : "— لم يُجب"}
                      </p>
                      <GradeAnswerForm answerId={answer.id} />
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
