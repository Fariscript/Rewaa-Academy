import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/rbac";
import { NotFoundError } from "@/lib/errors";
import { editQuestion } from "./manage";

export async function listRevisions(session: Session | null, questionId: string) {
  requireRole(session, ["ADMIN"]);

  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question) throw new NotFoundError("Question not found");

  return prisma.questionRevision.findMany({
    where: { questionId },
    orderBy: { createdAt: "desc" },
  });
}

// T-15/NFR-13 "restorable": re-enters the normal edit path rather than
// being a special bypass — archives the current content as a fresh
// revision, applies the chosen past revision's content, resets to DRAFT
// for re-approval, same as any other edit.
export async function restoreRevision(session: Session | null, questionId: string, revisionId: string) {
  requireRole(session, ["ADMIN"]);

  const revision = await prisma.questionRevision.findUnique({ where: { id: revisionId } });
  if (!revision || revision.questionId !== questionId) throw new NotFoundError("Revision not found");

  return editQuestion(session, questionId, {
    type: revision.type,
    prompt: revision.prompt,
    options: revision.options,
    correctOption: revision.correctOption,
  });
}
