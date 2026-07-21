import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getQuestionForAdmin } from "@/lib/questions/list";
import { listRevisions } from "@/lib/questions/revisions";
import { NotFoundError } from "@/lib/errors";
import { formatDateTime } from "@/lib/dates";
import { QUESTION_STATUS_LABELS, QUESTION_TYPE_LABELS } from "@/lib/content/labels";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { QuestionForm, type QuestionFormInitial } from "@/components/admin/question-form";
import { RestoreRevisionButton } from "@/components/admin/restore-revision-button";

// Slice 16: edit + revision history. Editing (or restoring) resets the
// question to DRAFT server-side — the approval hard gate has no bypass.
export default async function QuestionEditPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;

  let question, revisions;
  try {
    question = await getQuestionForAdmin(session, id);
    revisions = await listRevisions(session, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const initial: QuestionFormInitial = {
    type: question.type,
    prompt: question.prompt,
    options: Array.isArray(question.options) ? (question.options as { id: string; text: string }[]) : null,
    correctOption: question.correctOption,
  };

  return (
    <div>
      <div className="mb-4">
        <Link
          href={`/admin/quizzes/${question.quiz.id}/questions`}
          className="text-sm text-neutral-500 hover:underline dark:text-neutral-400"
        >
          → بنك أسئلة: {question.quiz.title}
        </Link>
      </div>
      <PageHeader title="تعديل سؤال" />

      <Card className="mb-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge>{QUESTION_TYPE_LABELS[question.type]}</Badge>
          <Badge variant={question.status === "APPROVED" ? "success" : "warning"}>
            {QUESTION_STATUS_LABELS[question.status]}
          </Badge>
        </div>
        {question.status === "APPROVED" ? (
          <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            تعديل سؤال معتمد يعيده إلى مسودة ويتطلب اعتماداً جديداً — لا نشر تلقائي.
          </p>
        ) : null}
        <QuestionForm
          submitUrl={`/api/admin/questions/${question.id}`}
          method="PATCH"
          returnTo={`/admin/quizzes/${question.quiz.id}/questions`}
          initial={initial}
        />
      </Card>

      <Card>
        <h2 className="mb-3 font-bold">سجل النسخ</h2>
        {revisions.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">لا توجد نسخ سابقة — لم يُعدّل هذا السؤال بعد.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-800">
            {revisions.map((revision) => (
              <li key={revision.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-sm font-medium">{revision.prompt}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {QUESTION_TYPE_LABELS[revision.type]} · {formatDateTime(revision.createdAt)}
                  </p>
                </div>
                <RestoreRevisionButton questionId={question.id} revisionId={revision.id} />
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
