import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/rbac";
import { NotFoundError } from "@/lib/errors";
import { editContentItem } from "./content-items";

export async function listContentItemRevisions(session: Session | null, contentItemId: string) {
  requireRole(session, ["ADMIN"]);

  const item = await prisma.contentItem.findUnique({ where: { id: contentItemId } });
  if (!item) throw new NotFoundError("Content item not found");

  return prisma.contentItemRevision.findMany({
    where: { contentItemId },
    orderBy: { createdAt: "desc" },
  });
}

// T-36 "restorable": re-enters the normal edit path rather than being a
// special bypass — archives the current content as a fresh revision,
// applies the chosen past revision's content, resets to DRAFT for
// re-publishing, same as any other edit. Mirrors restoreRevision for
// questions.
export async function restoreContentItemRevision(session: Session | null, contentItemId: string, revisionId: string) {
  requireRole(session, ["ADMIN"]);

  const revision = await prisma.contentItemRevision.findUnique({ where: { id: revisionId } });
  if (!revision || revision.contentItemId !== contentItemId) throw new NotFoundError("Revision not found");

  return editContentItem(session, contentItemId, {
    type: revision.type,
    body: revision.body,
    assetId: revision.assetId,
  });
}
