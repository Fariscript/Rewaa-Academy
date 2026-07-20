import type { Session } from "next-auth";
import { NextResponse } from "next/server";
import type { Role } from "@/generated/prisma/client";

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class UnauthenticatedError extends Error {
  constructor(message = "Unauthenticated") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

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

export function toErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof UnauthenticatedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  return null;
}
