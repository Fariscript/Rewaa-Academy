import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/rbac";
import { NotFoundError } from "@/lib/errors";

// Admin reads for the content-management UI. Reads only — every mutation
// stays in content-items.ts / content-item-revisions.ts with its audit
// trail, same split as the question bank's list.ts.

export async function listLessonContentItems(session: Session | null, lessonId: string) {
  requireRole(session, ["ADMIN"]);

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      title: true,
      unit: {
        select: { name: true, subSector: { select: { name: true, sector: { select: { name: true } } } } },
      },
      contentItems: {
        orderBy: { order: "asc" },
        include: {
          asset: true,
          createdBy: { select: { name: true, email: true } },
        },
      },
    },
  });
  if (!lesson) throw new NotFoundError("Lesson not found");
  return lesson;
}

export async function getContentItemForAdmin(session: Session | null, contentItemId: string) {
  requireRole(session, ["ADMIN"]);

  const item = await prisma.contentItem.findUnique({
    where: { id: contentItemId },
    include: {
      asset: true,
      lesson: { select: { id: true, title: true } },
    },
  });
  if (!item) throw new NotFoundError("Content item not found");
  return item;
}
