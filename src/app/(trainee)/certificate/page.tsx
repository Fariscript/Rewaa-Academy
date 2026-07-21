import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getCertificateStatus, issueOrGetCertificate } from "@/lib/certificates/certificate";
import { getMyLearningHome } from "@/lib/content/trainee-progress";
import { formatDate } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { BUTTON_CLASSES } from "@/components/ui/button";

// T-4: certificate auto-generation is lazy-on-access (the established
// no-scheduler pattern) — visiting this page IS the access, so an eligible
// trainee sees their certificate materialize here with no request step.
export default async function CertificatePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  let status = await getCertificateStatus(session);
  if (status.eligible && !status.certificate) {
    const certificate = await issueOrGetCertificate(session);
    status = { ...status, certificate };
  }

  if (status.certificate) {
    const certificate = status.certificate;
    return (
      <div>
        <PageHeader title="شهادتك" />
        <Card>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">شهادة إتمام التدريب</h2>
            <Badge variant="success">صادرة</Badge>
          </div>
          <dl className="mb-5 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-neutral-500 dark:text-neutral-400">الاسم</dt>
              <dd className="font-medium">{certificate.traineeName}</dd>
            </div>
            <div>
              <dt className="text-neutral-500 dark:text-neutral-400">تاريخ الإتمام</dt>
              <dd className="font-medium">{formatDate(certificate.completionDate)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500 dark:text-neutral-400">تاريخ الإصدار</dt>
              <dd className="font-medium">{formatDate(certificate.issuedAt)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500 dark:text-neutral-400">رقم الشهادة</dt>
              <dd className="font-medium" dir="ltr">
                {certificate.id}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center gap-3">
            <a href="/api/certificate/pdf" className={BUTTON_CLASSES.primary} download>
              تنزيل الشهادة (PDF)
            </a>
            <Link href={`/api/certificates/${certificate.id}/verify`} className={BUTTON_CLASSES.subtle} dir="ltr">
              رابط التحقق من الشهادة
            </Link>
          </div>
          <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
            الشهادة موقّعة رقمياً، ويمكن لأي جهة التحقق من صحتها عبر رابط التحقق دون تسجيل دخول.
          </p>
        </Card>
      </div>
    );
  }

  const home = await getMyLearningHome(session);
  if (!home || status.totalQuizzes === 0) {
    return (
      <div>
        <PageHeader title="شهادتك" />
        <EmptyState
          title="لا يمكن إصدار الشهادة بعد"
          description="ستصبح الشهادة متاحة بعد تعيينك في قطاع يحتوي على اختبارات."
        />
      </div>
    );
  }

  const remaining = home.subSectors
    .flatMap((s) => s.units)
    .flatMap((u) => u.lessons)
    .filter((l) => l.quiz && l.quiz.outcome.status !== "PASSED");

  return (
    <div>
      <PageHeader
        title="شهادتك"
        description="تُصدر الشهادة تلقائياً بمجرد اجتياز جميع اختبارات قطاعك"
      />
      <Card className="mb-4">
        <p>
          اجتزت <span dir="ltr">{status.passedQuizzes}</span> من <span dir="ltr">{status.totalQuizzes}</span> اختباراً
        </p>
      </Card>
      <Card>
        <h2 className="mb-3 font-bold">الاختبارات المتبقية</h2>
        <ul className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-800">
          {remaining.map((lesson) => (
            <li key={lesson.lessonId} className="py-2">
              <Link href={`/lessons/${lesson.lessonId}`} className="flex items-center justify-between gap-2 hover:underline">
                <span>{lesson.quiz!.title}</span>
                <Badge variant={lesson.quiz!.unlocked ? "info" : "neutral"}>
                  {lesson.quiz!.unlocked ? "متاح" : "أكمل الدرس أولاً"}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
