import type { Session } from "next-auth";
import type { Role } from "@/generated/prisma/client";
import { UnauthenticatedError, ForbiddenError } from "@/lib/errors";

/**
 * NFR-02: sector/role access control must be enforced server-side. Call this
 * at the top of every role-gated route handler — it throws rather than
 * returning a boolean so a forgotten check fails loudly instead of silently
 * falling through.
 */
export function requireRole(session: Session | null, allowedRoles: Role[]): asserts session is Session {
  if (!session?.user) throw new UnauthenticatedError();
  if (!allowedRoles.includes(session.user.role)) throw new ForbiddenError();
}
