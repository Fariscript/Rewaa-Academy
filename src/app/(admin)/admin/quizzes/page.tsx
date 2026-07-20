import Link from "next/link";
import { auth } from "@/auth";
import { listQuizzesForAdmin } from "@/lib/dashboard/quiz-index";
import { SKILL_TYPE_LABELS } from "@/lib/content/labels";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

// T-21 entry point: a flat quiz catalog, deliberately without aggregates —
// per-quiz numbers load on selection and trends are Phase 2 (T-24).
export default async function AdminQuizzesPage() {
  const session = await auth();
  const quizzes = await listQuizzesForAdmin(session);

  return (
    <div>
      <PageHeader title="الاختبارات" description="اختر اختباراً لعرض لوحة متابعته" />
      {quizzes.length === 0 ? (
        <EmptyState title="لا توجد اختبارات بعد" />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-start dark:border-neutral-800">
                <th className="p-3 text-start font-medium">الاختبار</th>
                <th className="p-3 text-start font-medium">القطاع</th>
                <th className="p-3 text-start font-medium">المسار</th>
                <th className="p-3 text-start font-medium">النوع</th>
                <th className="p-3 text-start font-medium">الأسئلة المعتمدة</th>
                <th className="p-3 text-start font-medium">المدة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {quizzes.map((quiz) => (
                <tr key={quiz.quizId} className="hover:bg-neutral-50 dark:hover:bg-neutral-900">
                  <td className="p-3">
                    <Link href={`/admin/quizzes/${quiz.quizId}`} className="font-medium hover:underline">
                      {quiz.quizTitle}
                    </Link>
                  </td>
                  <td className="p-3">{quiz.sector.name}</td>
                  <td className="p-3 text-neutral-500 dark:text-neutral-400">
                    {quiz.subSectorName} · {quiz.unitName}
                  </td>
                  <td className="p-3">
                    <Badge>{SKILL_TYPE_LABELS[quiz.skillType]}</Badge>
                  </td>
                  <td className="p-3">
                    {quiz.approvedQuestionCount === 0 ? (
                      <Badge variant="warning">لا أسئلة معتمدة</Badge>
                    ) : (
                      <span dir="ltr">{quiz.approvedQuestionCount}</span>
                    )}
                  </td>
                  <td className="p-3" dir="ltr">
                    {Math.round(quiz.timeLimitSeconds / 60)} د
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
