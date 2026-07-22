import Link from "next/link";
import { auth } from "@/auth";
import { getFullTaxonomy } from "@/lib/content/taxonomy";
import { SKILL_TYPE_LABELS } from "@/lib/content/labels";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

// FR-12/FR-18: entry point for content management — the full taxonomy tree,
// each lesson linking to its own content-items page. Taxonomy itself is
// read-only here (FR-18 CUD is a separate, not-yet-built piece); this page
// only needs it as navigation to reach a Lesson.
export default async function ContentIndexPage() {
  const session = await auth();
  const sectors = await getFullTaxonomy(session);

  return (
    <div>
      <PageHeader title="إدارة المحتوى" description="اختر درساً لإدارة عناصر محتواه (فيديو، PDF، مقال، صورة)" />

      {sectors.length === 0 ? (
        <EmptyState title="لا توجد قطاعات بعد" description="أضف قطاعات وأقساماً من قاعدة البيانات أولاً." />
      ) : (
        <div className="flex flex-col gap-6">
          {sectors.map((sector) => (
            <section key={sector.id}>
              <h2 className="mb-3 text-lg font-bold">{sector.name}</h2>
              <div className="flex flex-col gap-3">
                {sector.subSectors.map((subSector) => (
                  <Card key={subSector.id}>
                    <h3 className="mb-2 font-medium">{subSector.name}</h3>
                    {subSector.units.length === 0 ? (
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">لا توجد أقسام بعد.</p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {subSector.units.map((unit) => (
                          <div key={unit.id}>
                            <p className="mb-1 text-sm text-neutral-500 dark:text-neutral-400">
                              {unit.name} · {SKILL_TYPE_LABELS[unit.skillType]}
                            </p>
                            {unit.lessons.length === 0 ? (
                              <p className="text-sm text-neutral-400 dark:text-neutral-500">لا توجد دروس بعد.</p>
                            ) : (
                              <ul className="flex flex-wrap gap-2">
                                {unit.lessons.map((lesson) => (
                                  <li key={lesson.id}>
                                    <Link
                                      href={`/admin/content/lessons/${lesson.id}`}
                                      className="inline-block rounded-md bg-neutral-100 px-3 py-1.5 text-sm hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                                    >
                                      {lesson.title}
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
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
