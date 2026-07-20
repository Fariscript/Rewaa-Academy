import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/rbac";
import { UnauthenticatedError } from "@/lib/errors";

const sectorTreeInclude = {
  subSectors: {
    include: {
      units: {
        include: { lessons: true },
      },
    },
  },
} as const;

// FR-18/NFR-16: Admin-only view of the full taxonomy (used to pick a sector
// when assigning a trainee, and as the read side of future taxonomy CRUD).
export async function getFullTaxonomy(session: Session | null) {
  requireRole(session, ["ADMIN"]);
  return prisma.sector.findMany({
    include: sectorTreeInclude,
    orderBy: { name: "asc" },
  });
}

// FR-13/NFR-02: a trainee may browse content within their assigned sector
// only, enforced server-side. Reads the trainee's sectorId fresh from the
// DB (rather than trusting a cached session claim) so a reassignment takes
// effect immediately, not after a session-refresh throttle window.
export async function getMySectorContent(session: Session | null) {
  if (!session?.user) throw new UnauthenticatedError();

  const caller = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { sectorId: true },
  });

  if (!caller.sectorId) return null;

  return prisma.sector.findUnique({
    where: { id: caller.sectorId },
    include: sectorTreeInclude,
  });
}
