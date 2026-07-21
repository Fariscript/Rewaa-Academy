import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getTraineeReport } from "@/lib/dashboard/trainee-report";
import { NotFoundError } from "@/lib/errors";
import { formatDate, formatDateTime } from "@/lib/dates";
import { QUIZ_STATUS_LABELS } from "@/lib/content/labels";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

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

// T-24 (Phase 2): per-trainee performance report.
export default async function TraineeReportPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;

  let report;
  try {
    report = await getTraineeReport(session, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <div>
      <div className="mb-4">
        <Link href="/admin/trainees" className="text-sm text-neutral-500 hover:underline dark:text-neutral-400">
          → المتدربون
        </Link>
      </div>
      <PageHeader
        title={report.trainee.name ?? report.trainee.email}
        description={
          report.trainee.sector ? `قطاع ${report.trainee.sector.name} · ${report.trainee.email}` : report.trainee.email
        }
      />

      {!report.trainee.sector ? (
        <EmptyState title="لم يُعيّن في قطاع بعد" description="عيّنه من صفحة المتدربين لتظهر تقاريره هنا." />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-3">
            <Tile label="الدروس المكتملة" value={`${report.totals.lessonsCompleted}/${report.totals.totalLessons}`} />
            <Tile label="الاختبارات المجتازة" value={`${report.totals.quizzesPassed}/${report.totals.totalQuizzes}`} />
            <Tile
              label="متوسط أفضل النتائج"
              value={report.totals.averageBestScore === null ? "—" : `${Math.round(report.totals.averageBestScore)}%`}
            />
            <Tile
              label="الشهادة"
              value={report.certificateIssuedAt ? formatDate(report.certificateIssuedAt) : "لم تصدر"}
            />
          </div>

          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800">
                  <th className="p-3 text-start font-medium">الاختبار</th>
                  <th className="p-3 text-start font-medium">الحالة</th>
                  <th className="p-3 text-start font-medium">المحاولات</th>
                  <th className="p-3 text-start font-medium">أفضل نتيجة</th>
                  <th className="p-3 text-start font-medium">آخر نشاط</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {report.quizzes.map((row) => (
                  <tr key={row.quizId}>
                    <td className="p-3">
                      <Link href={`/admin/quizzes/${row.quizId}`} className="font-medium hover:underline">
                        {row.quizTitle}
                      </Link>
                      <p className="text-neutral-500 dark:text-neutral-400">{row.unitName}</p>
                    </td>
                    <td className="p-3">
                      <Badge variant={STATUS_VARIANTS[row.outcome.status]}>
                        {QUIZ_STATUS_LABELS[row.outcome.status]}
                      </Badge>
                    </td>
                    <td className="p-3" dir="ltr">
                      {row.outcome.attemptsUsed}/{row.outcome.attemptsAllowed}
                    </td>
                    <td className="p-3" dir="ltr">
                      {row.outcome.bestScore === null ? "—" : `${row.outcome.bestScore}%`}
                    </td>
                    <td className="p-3 text-neutral-500 dark:text-neutral-400">
                      {row.lastActivityAt ? formatDateTime(row.lastActivityAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
