import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMyLearningHome } from "@/lib/content/trainee-progress";
import { QUIZ_STATUS_LABELS, SKILL_TYPE_LABELS } from "@/lib/content/labels";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { LearningHomeLesson } from "@/lib/content/trainee-progress";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  NOT_STARTED: "neutral",
  IN_PROGRESS: "info",
  AWAITING_MANUAL_GRADE: "warning",
  PASSED: "success",
  FAILED_FINAL_ATTEMPT: "neutral",
};

function QuizBadge({ lesson }: { lesson: LearningHomeLesson }) {
  if (!lesson.quiz) return null;
  if (!lesson.quiz.unlocked) return <Badge variant="neutral">الاختبار مقفل</Badge>;
  const status = lesson.quiz.outcome.status;
  return <Badge variant={STATUS_VARIANTS[status]}>{QUIZ_STATUS_LABELS[status]}</Badge>;
}

// FR-04/FR-13: the Knowledge Library home — the trainee's sector tree with
// per-lesson completion and per-quiz state, computed server-side.
export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const home = await getMyLearningHome(session);

  if (!home) {
    return (
      <EmptyState
        title="لم يتم تعيينك في قطاع بعد"
        description="تواصل مع مسؤول التدريب ليتم تعيينك في قطاعك، وستظهر لك دروس القطاع هنا."
      />
    );
  }

  return (
    <div>
      <PageHeader title={`قطاع ${home.sector.name}`} description="أكمل كل درس ثم اجتز اختباره" />
      <div className="flex flex-col gap-6">
        {home.subSectors.map((subSector) => (
          <section key={subSector.subSectorId}>
            <h2 className="mb-3 text-lg font-bold">{subSector.name}</h2>
            <div className="flex flex-col gap-4">
              {subSector.units.map((unit) => (
                <Card key={unit.unitId}>
                  <div className="mb-3 flex items-center gap-2">
                    <h3 className="font-medium">{unit.name}</h3>
                    <Badge>{SKILL_TYPE_LABELS[unit.skillType]}</Badge>
                  </div>
                  <ul className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-800">
                    {unit.lessons.map((lesson) => (
                      <li key={lesson.lessonId}>
                        <Link
                          href={`/lessons/${lesson.lessonId}`}
                          className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                        >
                          <span className="flex items-center gap-2">
                            <span>{lesson.title}</span>
                            {lesson.completed ? <Badge variant="success">مكتمل</Badge> : null}
                          </span>
                          <QuizBadge lesson={lesson} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
