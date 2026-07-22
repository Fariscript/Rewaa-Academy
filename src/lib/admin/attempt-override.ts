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
// reason, audited (NFR-05). Manual, Admin-initiated grants — unrelated to
// (and unrestricted by) the automatic redo-loop grants below; open item #1
// (RESOLVED 2026-07-22) resolved what happens after 2 failed attempts
// without touching this function or an Admin's ability to use it.
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

// Attribution account for grantAutomaticFreshAttempts below — see
// prisma/seed.ts for why a dedicated system User (not a nullable
// grantedById, not a source-discriminator column) was chosen: it reuses
// AttemptCapOverride/recordAudit completely unchanged, at the cost of one
// seeded fixture row instead of a schema change.
const REDO_LOOP_SYSTEM_USER_EMAIL = "system-redo-loop@rewaa-internal.local";

// Open item #1 (RESOLVED 2026-07-22, see CLAUDE.md): the redo-loop grants
// a fresh 2-attempt window automatically the moment a trainee redoes a
// lesson whose quiz they'd failed both attempts on — see
// markLessonComplete in src/lib/content/lesson-completion.ts, the only
// caller. Reuses the exact same AttemptCapOverride + audit mechanism as
// grantExtraAttempt above, just attributed to the system account instead
// of a real Admin, so the audit trail can always tell an automatic grant
// apart from a manual one. Does not touch or restrict grantExtraAttempt —
// Admins can still grant manually on top of this at any time.
export async function grantAutomaticFreshAttempts(
  traineeId: string,
  quizId: string,
): Promise<{ allowedAttempts: number }> {
  const system = await prisma.user.findUniqueOrThrow({ where: { email: REDO_LOOP_SYSTEM_USER_EMAIL } });

  await prisma.attemptCapOverride.create({
    data: {
      userId: traineeId,
      quizId,
      extraAttempts: DEFAULT_MAX_ATTEMPTS,
      reason: "منح تلقائي: إعادة إنجاز الدرس بعد إخفاق المحاولتين (حلقة الإعادة — البند المفتوح #1)",
      grantedById: system.id,
    },
  });

  const allowedAttempts = await getAllowedAttempts(traineeId, quizId);

  await recordAudit(system.id, "attempt_cap_override_auto_granted", "User", traineeId, {
    quizId,
    extraAttempts: DEFAULT_MAX_ATTEMPTS,
    newAllowedAttempts: allowedAttempts,
  });

  return { allowedAttempts };
}
