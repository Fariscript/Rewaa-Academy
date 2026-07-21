import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { listQuizQuestions } from "@/lib/questions/list";
import { NotFoundError } from "@/lib/errors";
import { QUESTION_SOURCE_LABELS, QUESTION_STATUS_LABELS, QUESTION_TYPE_LABELS } from "@/lib/content/labels";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { BUTTON_CLASSES } from "@/components/ui/button";
import { QuestionActions } from "@/components/admin/question-actions";
import { DraftQuestionsPanel } from "@/components/admin/draft-questions-panel";

const STATUS_ORDER = ["DRAFT", "APPROVED", "RETIRED", "REJECTED"] as const;
const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  DRAFT: "warning",
  APPROVED: "success",
  RETIRED: "neutral",
  REJECTED: "danger",
};

// Slice 16: the question bank per quiz. Every question — AI-drafted or
// manual — starts DRAFT and needs the explicit approve step below before
// quiz assembly will serve it (T-11/T-12, NFR-06 hard gate).
export default async function QuizQuestionsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;

  let quiz;
  try {
    quiz = await listQuizQuestions(session, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const groups = STATUS_ORDER.map((status) => ({
    status,
    questions: quiz.questions.filter((q) => q.status === status),
  })).filter((group) => group.questions.length > 0);

  return (
    <div>
      <div className="mb-4">
        <Link href={`/admin/quizzes/${quiz.id}`} className="text-sm text-neutral-500 hover:underline dark:text-neutral-400">
          → لوحة الاختبار
        </Link>
      </div>
      <PageHeader
        title={`بنك أسئلة: ${quiz.title}`}
        description={`${quiz.lesson.unit.subSector.name} · ${quiz.lesson.unit.name}`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href={`/admin/quizzes/${quiz.id}/questions/new`} className={BUTTON_CLASSES.primary}>
          + سؤال جديد
        </Link>
      </div>

      <div className="mb-6">
        <DraftQuestionsPanel quizId={quiz.id} />
      </div>

      {groups.length === 0 ? (
        <EmptyState title="لا توجد أسئلة بعد" description="أضف سؤالاً يدوياً أو اصغ مسودات بالذكاء الاصطناعي." />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.status}>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
                {QUESTION_STATUS_LABELS[group.status]}
                <span className="text-sm font-normal text-neutral-500 dark:text-neutral-400" dir="ltr">
                  {group.questions.length}
                </span>
              </h2>
              <div className="flex flex-col gap-3">
                {group.questions.map((question) => (
                  <Card key={question.id}>
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium">{question.prompt}</p>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge>{QUESTION_TYPE_LABELS[question.type]}</Badge>
                        <Badge variant={STATUS_VARIANTS[question.status]}>
                          {QUESTION_STATUS_LABELS[question.status]}
                        </Badge>
                      </div>
                    </div>
                    {Array.isArray(question.options) ? (
                      <ul className="mb-2 flex flex-wrap gap-2 text-sm text-neutral-600 dark:text-neutral-300">
                        {(question.options as { id: string; text: string }[]).map((option) => (
                          <li
                            key={option.id}
                            className={`rounded-md px-2 py-0.5 ${
                              option.id === question.correctOption
                                ? "bg-emerald-100 font-medium dark:bg-emerald-900"
                                : "bg-neutral-100 dark:bg-neutral-800"
                            }`}
                          >
                            {option.text}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
                      {QUESTION_SOURCE_LABELS[question.source]}
                      {question.createdBy ? <> · أضافه {question.createdBy.name ?? question.createdBy.email}</> : null}
                      {question.approvedBy ? (
                        <> · اعتمده {question.approvedBy.name ?? question.approvedBy.email}</>
                      ) : null}
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <QuestionActions questionId={question.id} status={question.status} />
                      {question.status === "DRAFT" || question.status === "APPROVED" ? (
                        <Link href={`/admin/questions/${question.id}`} className={BUTTON_CLASSES.subtle}>
                          تعديل / السجل
                        </Link>
                      ) : null}
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
