import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/rbac";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit/log";

// T-11/T-12/NFR-06: hard gate — only a question currently DRAFT can be
// approved or rejected. No path exists that publishes a draft without this
// explicit step (CLAUDE.md "Slice 5 decisions").
export async function approveQuestion(session: Session | null, questionId: string) {
  requireRole(session, ["ADMIN"]);

  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question) throw new NotFoundError("Question not found");
  if (question.status !== "DRAFT") {
    throw new ForbiddenError(`Cannot approve a question with status ${question.status}`);
  }

  const updated = await prisma.question.update({
    where: { id: questionId },
    data: { status: "APPROVED", approvedById: session.user.id, approvedAt: new Date() },
  });

  await recordAudit(session.user.id, "question_approved", "Question", questionId, {
    quizId: question.quizId,
  });

  return updated;
}

// Rejection is permanent and distinct from retirement: a rejected draft
// never becomes eligible, it isn't "withdrawn" content that was once live.
export async function rejectQuestion(session: Session | null, questionId: string) {
  requireRole(session, ["ADMIN"]);

  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question) throw new NotFoundError("Question not found");
  if (question.status !== "DRAFT") {
    throw new ForbiddenError(`Cannot reject a question with status ${question.status}`);
  }

  const updated = await prisma.question.update({
    where: { id: questionId },
    data: { status: "REJECTED" },
  });

  await recordAudit(session.user.id, "question_rejected", "Question", questionId, {
    quizId: question.quizId,
  });

  return updated;
}
