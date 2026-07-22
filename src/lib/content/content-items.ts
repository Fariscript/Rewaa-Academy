import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/rbac";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit/log";
import { validateContentItemInput, type ContentItemContentInput } from "./validate-content-item";
import type { ContentItemType } from "@/generated/prisma/client";

async function resolveAsset(assetId: string | null, expectedType: ContentItemType) {
  if (assetId === null) return null;
  const asset = await prisma.contentAsset.findUnique({ where: { id: assetId } });
  if (!asset) throw new NotFoundError("Content asset not found");
  if (asset.type !== expectedType) {
    throw new ForbiddenError(`asset type ${asset.type} does not match content item type ${expectedType}`);
  }
  return asset;
}

// FR-12: manually-authored content items start DRAFT, same hard gate as the
// question bank — no bypass, an Admin must explicitly publish before
// trainees can see it (mirrors CLAUDE.md "Slice 5 decisions").
export async function createContentItem(session: Session | null, lessonId: string, input: ContentItemContentInput) {
  requireRole(session, ["ADMIN"]);

  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) throw new NotFoundError("Lesson not found");

  const result = validateContentItemInput(input);
  if (!result.ok) throw new ForbiddenError(`Invalid content item: ${result.reason}`);
  await resolveAsset(result.value.assetId, result.value.type);

  const last = await prisma.contentItem.findFirst({
    where: { lessonId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const order = (last?.order ?? 0) + 1;

  const created = await prisma.contentItem.create({
    data: {
      lessonId,
      type: result.value.type,
      order,
      body: result.value.body,
      assetId: result.value.assetId,
      status: "DRAFT",
      createdById: session.user.id,
    },
  });

  await recordAudit(session.user.id, "content_item_created", "ContentItem", created.id, { lessonId });

  return created;
}

// T-36: archives the pre-edit content as a ContentItemRevision, then applies
// the new content and resets status to DRAFT — an edit to already-published
// content re-clears the same gate as a fresh draft, same rule as
// editQuestion.
export async function editContentItem(session: Session | null, contentItemId: string, input: ContentItemContentInput) {
  requireRole(session, ["ADMIN"]);

  const item = await prisma.contentItem.findUnique({ where: { id: contentItemId } });
  if (!item) throw new NotFoundError("Content item not found");

  const result = validateContentItemInput(input);
  if (!result.ok) throw new ForbiddenError(`Invalid content item: ${result.reason}`);
  await resolveAsset(result.value.assetId, result.value.type);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.contentItemRevision.create({
      data: {
        contentItemId,
        type: item.type,
        body: item.body,
        assetId: item.assetId,
        status: item.status,
        editedById: session.user.id,
      },
    });

    return tx.contentItem.update({
      where: { id: contentItemId },
      data: {
        type: result.value.type,
        body: result.value.body,
        assetId: result.value.assetId,
        status: "DRAFT",
      },
    });
  });

  await recordAudit(session.user.id, "content_item_edited", "ContentItem", contentItemId, { lessonId: item.lessonId });

  return updated;
}

export async function publishContentItem(session: Session | null, contentItemId: string) {
  requireRole(session, ["ADMIN"]);

  const item = await prisma.contentItem.findUnique({ where: { id: contentItemId } });
  if (!item) throw new NotFoundError("Content item not found");
  if (item.status !== "DRAFT") {
    throw new ForbiddenError(`Cannot publish a content item with status ${item.status}`);
  }

  const updated = await prisma.contentItem.update({ where: { id: contentItemId }, data: { status: "PUBLISHED" } });

  await recordAudit(session.user.id, "content_item_published", "ContentItem", contentItemId, {
    lessonId: item.lessonId,
  });

  return updated;
}

export async function unpublishContentItem(session: Session | null, contentItemId: string) {
  requireRole(session, ["ADMIN"]);

  const item = await prisma.contentItem.findUnique({ where: { id: contentItemId } });
  if (!item) throw new NotFoundError("Content item not found");
  if (item.status !== "PUBLISHED") {
    throw new ForbiddenError(`Cannot unpublish a content item with status ${item.status}`);
  }

  const updated = await prisma.contentItem.update({ where: { id: contentItemId }, data: { status: "DRAFT" } });

  await recordAudit(session.user.id, "content_item_unpublished", "ContentItem", contentItemId, {
    lessonId: item.lessonId,
  });

  return updated;
}

// Swaps `order` with the adjacent item in the same lesson. Stages through a
// sentinel (-1, never a real order value — those start at 1) so the
// @@unique([lessonId, order]) constraint never sees a transient collision
// between the two sequential updates.
export async function moveContentItem(session: Session | null, contentItemId: string, direction: "up" | "down") {
  requireRole(session, ["ADMIN"]);

  const item = await prisma.contentItem.findUnique({ where: { id: contentItemId } });
  if (!item) throw new NotFoundError("Content item not found");

  const neighbor = await prisma.contentItem.findFirst({
    where: {
      lessonId: item.lessonId,
      order: direction === "up" ? { lt: item.order } : { gt: item.order },
    },
    orderBy: { order: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbor) return item;

  await prisma.$transaction([
    prisma.contentItem.update({ where: { id: item.id }, data: { order: -1 } }),
    prisma.contentItem.update({ where: { id: neighbor.id }, data: { order: item.order } }),
    prisma.contentItem.update({ where: { id: item.id }, data: { order: neighbor.order } }),
  ]);

  await recordAudit(session.user.id, "content_item_reordered", "ContentItem", contentItemId, {
    lessonId: item.lessonId,
    direction,
  });

  return prisma.contentItem.findUniqueOrThrow({ where: { id: contentItemId } });
}
