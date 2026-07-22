import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { listLessonContentItems } from "@/lib/content/content-items-list";
import { NotFoundError } from "@/lib/errors";
import { CONTENT_ITEM_STATUS_LABELS, CONTENT_ITEM_TYPE_LABELS } from "@/lib/content/labels";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { BUTTON_CLASSES } from "@/components/ui/button";
import { ContentItemActions } from "@/components/admin/content-item-actions";
import { MoveContentItemButtons } from "@/components/admin/move-content-item-buttons";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  DRAFT: "warning",
  PUBLISHED: "success",
};

// FR-11/FR-12: content items for one lesson, ordered — the sequence a
// trainee will see once the real FR-11 journey is built. Every item starts
// DRAFT and needs an explicit publish before it's trainee-visible (same
// hard-gate pattern as the question bank).
export default async function LessonContentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;

  let lesson;
  try {
    lesson = await listLessonContentItems(session, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <div>
      <div className="mb-4">
        <Link href="/admin/content" className="text-sm text-neutral-500 hover:underline dark:text-neutral-400">
          → إدارة المحتوى
        </Link>
      </div>
      <PageHeader
        title={`محتوى الدرس: ${lesson.title}`}
        description={`${lesson.unit.subSector.sector.name} · ${lesson.unit.subSector.name} · ${lesson.unit.name}`}
      />

      <div className="mb-4">
        <Link href={`/admin/content/lessons/${lesson.id}/new`} className={BUTTON_CLASSES.primary}>
          + عنصر محتوى جديد
        </Link>
      </div>

      {lesson.contentItems.length === 0 ? (
        <EmptyState title="لا توجد عناصر محتوى بعد" description="أضف فيديو أو مقالاً أو ملف PDF لهذا الدرس." />
      ) : (
        <ol className="flex flex-col gap-3">
          {lesson.contentItems.map((item, index) => (
            <li key={item.id}>
              <Card>
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MoveContentItemButtons
                      contentItemId={item.id}
                      disableUp={index === 0}
                      disableDown={index === lesson.contentItems.length - 1}
                    />
                    <Badge>{CONTENT_ITEM_TYPE_LABELS[item.type]}</Badge>
                    <Badge variant={STATUS_VARIANTS[item.status]}>{CONTENT_ITEM_STATUS_LABELS[item.status]}</Badge>
                  </div>
                </div>
                {item.type === "ARTICLE" ? (
                  <p className="mb-3 line-clamp-3 text-sm text-neutral-700 dark:text-neutral-300">{item.body}</p>
                ) : item.asset ? (
                  <p className="mb-3 text-sm text-neutral-700 dark:text-neutral-300">
                    <a href={item.asset.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {item.asset.originalName}
                    </a>
                  </p>
                ) : null}
                <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
                  {item.createdBy ? <>أضافه {item.createdBy.name ?? item.createdBy.email}</> : null}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <ContentItemActions contentItemId={item.id} status={item.status} />
                  <Link href={`/admin/content/items/${item.id}`} className={BUTTON_CLASSES.subtle}>
                    تعديل / السجل
                  </Link>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
