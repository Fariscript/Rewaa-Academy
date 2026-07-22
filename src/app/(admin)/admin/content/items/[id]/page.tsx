import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getContentItemForAdmin } from "@/lib/content/content-items-list";
import { listContentItemRevisions } from "@/lib/content/content-item-revisions";
import { NotFoundError } from "@/lib/errors";
import { formatDateTime } from "@/lib/dates";
import { CONTENT_ITEM_STATUS_LABELS, CONTENT_ITEM_TYPE_LABELS } from "@/lib/content/labels";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ContentItemForm, type ContentItemFormInitial } from "@/components/admin/content-item-form";
import { RestoreContentItemRevisionButton } from "@/components/admin/restore-content-item-revision-button";

// FR-12/T-36: edit + revision history. Editing (or restoring) resets the
// item to DRAFT server-side — the publish gate has no bypass, mirrors the
// question bank's edit page.
export default async function ContentItemEditPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;

  let item, revisions;
  try {
    item = await getContentItemForAdmin(session, id);
    revisions = await listContentItemRevisions(session, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const initial: ContentItemFormInitial = {
    type: item.type,
    body: item.body,
    asset: item.asset ? { id: item.asset.id, originalName: item.asset.originalName } : null,
  };

  return (
    <div>
      <div className="mb-4">
        <Link
          href={`/admin/content/lessons/${item.lesson.id}`}
          className="text-sm text-neutral-500 hover:underline dark:text-neutral-400"
        >
          → محتوى الدرس: {item.lesson.title}
        </Link>
      </div>
      <PageHeader title="تعديل عنصر محتوى" />

      <Card className="mb-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge>{CONTENT_ITEM_TYPE_LABELS[item.type]}</Badge>
          <Badge variant={item.status === "PUBLISHED" ? "success" : "warning"}>
            {CONTENT_ITEM_STATUS_LABELS[item.status]}
          </Badge>
        </div>
        {item.status === "PUBLISHED" ? (
          <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            تعديل عنصر منشور يعيده إلى مسودة ويتطلب نشراً جديداً — لا نشر تلقائي.
          </p>
        ) : null}
        <ContentItemForm
          // Keyed on updatedAt so a restore (which changes server data but
          // stays on this same page via router.refresh(), not a navigation)
          // remounts the form instead of leaving useState's initial values
          // stale — otherwise a restore looks applied in the revision list
          // below but the form still shows the pre-restore edit, and an
          // unchanged re-save would silently re-clobber the restore.
          key={item.updatedAt.toISOString()}
          submitUrl={`/api/admin/content-items/${item.id}`}
          method="PATCH"
          returnTo={`/admin/content/lessons/${item.lesson.id}`}
          initial={initial}
        />
      </Card>

      <Card>
        <h2 className="mb-3 font-bold">سجل النسخ</h2>
        {revisions.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">لا توجد نسخ سابقة — لم يُعدّل هذا العنصر بعد.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-800">
            {revisions.map((revision) => (
              <li key={revision.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-sm font-medium">
                    {revision.type === "ARTICLE" ? revision.body : `(ملف مرفق: ${revision.assetId ?? "—"})`}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {CONTENT_ITEM_TYPE_LABELS[revision.type]} · {formatDateTime(revision.createdAt)}
                  </p>
                </div>
                <RestoreContentItemRevisionButton contentItemId={item.id} revisionId={revision.id} />
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
