import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getQuizDashboard } from "@/lib/dashboard/quiz-dashboard";
import { getQuizTrends } from "@/lib/dashboard/quiz-trends";
import { NotFoundError } from "@/lib/errors";
import { formatDate } from "@/lib/dates";
import { QUIZ_STATUS_LABELS } from "@/lib/content/labels";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { GrantAttemptButton } from "@/components/admin/grant-attempt-button";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  NOT_STARTED: "neutral",
  IN_PROGRESS: "info",
  AWAITING_MANUAL_GRADE: "warning",
  PASSED: "success",
  FAILED_FINAL_ATTEMPT: "danger",
};

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="flex-1 basis-32 text-center">
      <p className="text-2xl font-bold" dir="ltr">
        {value}
      </p>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">{label}</p>
    </Card>
  );
}

// T-21/T-22/T-23: the basic per-quiz dashboard — completion states, cohort
// average, failed-both flag — nothing more (deeper analytics are T-24,
// Phase 2, by explicit rule).
export default async function AdminQuizDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;

  let dashboard, trends;
  try {
    dashboard = await getQuizDashboard(session, id);
    trends = await getQuizTrends(session, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const { summary } = dashboard;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/admin/quizzes" className="text-sm text-neutral-500 hover:underline dark:text-neutral-400">
          → كل الاختبارات
        </Link>
        <Link
          href={`/admin/quizzes/${dashboard.quizId}/questions`}
          className="text-sm text-neutral-600 hover:underline dark:text-neutral-300"
        >
          بنك الأسئلة
        </Link>
      </div>
      <PageHeader title={dashboard.quizTitle} />

      <div className="mb-6 flex flex-wrap gap-3">
        <Tile label="المتدربون" value={summary.totalTrainees} />
        <Tile label="ناجحون" value={summary.passed} />
        <Tile label="لم يبدؤوا" value={summary.notStarted} />
        <Tile label="على المحاولة الثانية" value={summary.onAttempt2} />
        <Tile label="بانتظار التصحيح" value={summary.awaitingManualGrade} />
        <Tile label="أخفقوا في المحاولتين" value={summary.failedBothAttempts} />
        <Tile label="متوسط الدرجات" value={summary.averageScore === null ? "—" : `${Math.round(summary.averageScore)}%`} />
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-800">
              <th className="p-3 text-start font-medium">المتدرب</th>
              <th className="p-3 text-start font-medium">الحالة</th>
              <th className="p-3 text-start font-medium">المحاولات</th>
              <th className="p-3 text-start font-medium">أفضل نتيجة</th>
              <th className="p-3 text-start font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {dashboard.trainees.map((row) => (
              <tr key={row.trainee.id}>
                <td className="p-3">
                  <p className="font-medium">{row.trainee.name ?? row.trainee.email}</p>
                  <p className="text-neutral-500 dark:text-neutral-400" dir="ltr">
                    {row.trainee.email}
                  </p>
                </td>
                <td className="p-3">
                  <Badge variant={STATUS_VARIANTS[row.status]}>{QUIZ_STATUS_LABELS[row.status]}</Badge>
                </td>
                <td className="p-3" dir="ltr">
                  {row.attemptsUsed}/{row.attemptsAllowed}
                </td>
                <td className="p-3" dir="ltr">
                  {row.bestScore === null ? "—" : `${row.bestScore}%`}
                </td>
                <td className="p-3">
                  {row.status === "FAILED_FINAL_ATTEMPT" ? (
                    <GrantAttemptButton traineeId={row.trainee.id} quizId={dashboard.quizId} />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* T-24 (Phase 2): training-level trends — finalized attempts only. */}
      <h2 className="mb-3 mt-8 text-lg font-bold">التحليلات</h2>
      <div className="flex flex-col gap-4 lg:flex-row">
        <Card className="flex-1 overflow-x-auto p-0">
          <p className="p-3 pb-0 font-medium">آخر 8 أسابيع</p>
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
                <th className="p-3 text-start font-medium">الأسبوع</th>
                <th className="p-3 text-start font-medium">المحاولات</th>
                <th className="p-3 text-start font-medium">متوسط الدرجات</th>
                <th className="p-3 text-start font-medium">نسبة النجاح</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {trends.weekly.map((week) => (
                <tr key={week.weekStart.toISOString()}>
                  <td className="p-3">{formatDate(week.weekStart)}</td>
                  <td className="p-3" dir="ltr">
                    {week.attempts}
                  </td>
                  <td className="p-3" dir="ltr">
                    {week.averageScore === null ? "—" : `${Math.round(week.averageScore)}%`}
                  </td>
                  <td className="p-3" dir="ltr">
                    {week.passRate === null ? "—" : `${Math.round(week.passRate * 100)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card className="flex-1 overflow-x-auto p-0 lg:max-w-sm">
          <p className="p-3 pb-0 font-medium">حسب رقم المحاولة</p>
          {trends.byAttemptNumber.length === 0 ? (
            <p className="p-3 text-sm text-neutral-500 dark:text-neutral-400">لا محاولات مكتملة بعد.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800">
                  <th className="p-3 text-start font-medium">المحاولة</th>
                  <th className="p-3 text-start font-medium">العدد</th>
                  <th className="p-3 text-start font-medium">المتوسط</th>
                  <th className="p-3 text-start font-medium">النجاح</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {trends.byAttemptNumber.map((row) => (
                  <tr key={row.attemptNumber}>
                    <td className="p-3" dir="ltr">
                      {row.attemptNumber}
                    </td>
                    <td className="p-3" dir="ltr">
                      {row.attempts}
                    </td>
                    <td className="p-3" dir="ltr">
                      {row.averageScore === null ? "—" : `${Math.round(row.averageScore)}%`}
                    </td>
                    <td className="p-3" dir="ltr">
                      {row.passRate === null ? "—" : `${Math.round(row.passRate * 100)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
