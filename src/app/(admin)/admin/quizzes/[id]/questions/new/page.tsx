import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { listQuizQuestions } from "@/lib/questions/list";
import { NotFoundError } from "@/lib/errors";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { QuestionForm } from "@/components/admin/question-form";

// T-13: manual authoring. The created question lands as DRAFT — manual
// authorship gets no approval bypass (CLAUDE.md slice 5 decisions).
export default async function NewQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;

  let quiz;
  try {
    quiz = await listQuizQuestions(session, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <div>
      <div className="mb-4">
        <Link
          href={`/admin/quizzes/${quiz.id}/questions`}
          className="text-sm text-neutral-500 hover:underline dark:text-neutral-400"
        >
          → بنك الأسئلة
        </Link>
      </div>
      <PageHeader title={`سؤال جديد: ${quiz.title}`} description="يُنشأ كمسودة ويتطلب اعتماداً قبل ظهوره للمتدربين" />
      <Card>
        <QuestionForm
          submitUrl={`/api/admin/quizzes/${quiz.id}/questions`}
          method="POST"
          returnTo={`/admin/quizzes/${quiz.id}/questions`}
        />
      </Card>
    </div>
  );
}
