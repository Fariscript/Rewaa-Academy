import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { finalizeAttempt, syncExpiry } from "./attempt-lifecycle";

// Idempotent: submitting an already-finalized attempt (whether it finalized
// via this call, a prior explicit submit, or syncExpiry's auto-submit)
// just returns its current state rather than erroring.
export async function submitAttempt(session: Session | null, attemptId: string) {
  if (!session?.user) throw new UnauthenticatedError();

  const attempt = await prisma.attempt.findUnique({ where: { id: attemptId } });
  if (!attempt) throw new NotFoundError("Attempt not found");
  if (attempt.userId !== session.user.id) throw new ForbiddenError();

  const synced = await syncExpiry(attemptId);
  if (synced.status === "IN_PROGRESS") {
    await finalizeAttempt(attemptId, "SUBMITTED");
  }

  return prisma.attempt.findUniqueOrThrow({ where: { id: attemptId }, include: { answers: true } });
}
