import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/rbac";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit/log";

// T-3/T-20: the immutable default — every trainee gets exactly 2 attempts
// per quiz unless an Admin explicitly grants more for that one
// (trainee, quiz) pair below. Nothing may reassign this value.
export const DEFAULT_MAX_ATTEMPTS = 2;

export async function getAllowedAttempts(userId: string, quizId: string): Promise<number> {
  const grants = await prisma.attemptCapOverride.aggregate({
    where: { userId, quizId },
    _sum: { extraAttempts: true },
  });
  return DEFAULT_MAX_ATTEMPTS + (grants._sum.extraAttempts ?? 0);
}

// Roles table (CLAUDE.md): Admin "can override attempts". Each call grants
// exactly one extra attempt on one quiz, append-only with a required
// reason, audited (NFR-05). This deliberately does not decide open item #1
// (the consequence of failing both attempts): a grant raises the cap and
// thereby returns a both-failed trainee to attempts-remaining — nothing
// automatic happens without an Admin choosing this.
export async function grantExtraAttempt(
  session: Session | null,
  traineeId: string,
  quizId: string,
  reason: string,
): Promise<{ allowedAttempts: number }> {
  requireRole(session, ["ADMIN"]);

  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw new ForbiddenError("A reason is required to grant an extra attempt");
  }

  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!quiz) throw new NotFoundError("Quiz not found");

  const trainee = await prisma.user.findUnique({ where: { id: traineeId } });
  if (!trainee) throw new NotFoundError("Trainee not found");
  if (trainee.role !== "TRAINEE") {
    throw new ForbiddenError("Attempt overrides can only be granted to trainees");
  }

  await prisma.attemptCapOverride.create({
    data: { userId: traineeId, quizId, reason: reason.trim(), grantedById: session.user.id },
  });

  const allowedAttempts = await getAllowedAttempts(traineeId, quizId);

  await recordAudit(session.user.id, "attempt_cap_override_granted", "User", traineeId, {
    quizId,
    reason: reason.trim(),
    newAllowedAttempts: allowedAttempts,
  });

  return { allowedAttempts };
}
