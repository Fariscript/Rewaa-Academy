import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/rbac";

// Admin-only: the read side of "Admin manages taxonomy... assigns/reassigns
// trainees to sectors" (Roles table, CLAUDE.md) and FR-07. Sector assignment
// itself lands in slice 2b. Kept as a plain function (session passed in,
// rather than reading `auth()` itself) so it's testable without a live
// Next.js request context — the route handler is a thin adapter over this.
export async function listUsers(session: Session | null) {
  requireRole(session, ["ADMIN"]);
  return prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true },
    orderBy: { email: "asc" },
  });
}
