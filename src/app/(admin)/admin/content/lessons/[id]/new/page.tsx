import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { listLessonContentItems } from "@/lib/content/content-items-list";
import { NotFoundError } from "@/lib/errors";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ContentItemForm } from "@/components/admin/content-item-form";

// FR-12: manual authoring. The created item lands as DRAFT — no publish
// bypass, same as the question bank.
export default async function NewContentItemPage({ params }: { params: Promise<{ id: string }> }) {
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
        <Link href={`/admin/content/lessons/${lesson.id}`} className="text-sm text-neutral-500 hover:underline dark:text-neutral-400">
          → محتوى الدرس
        </Link>
      </div>
      <PageHeader title={`عنصر محتوى جديد: ${lesson.title}`} description="يُنشأ كمسودة ويتطلب نشراً قبل ظهوره للمتدربين" />
      <Card>
        <ContentItemForm
          submitUrl={`/api/admin/lessons/${lesson.id}/content-items`}
          method="POST"
          returnTo={`/admin/content/lessons/${lesson.id}`}
        />
      </Card>
    </div>
  );
}
