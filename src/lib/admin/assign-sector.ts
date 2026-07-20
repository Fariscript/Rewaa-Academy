import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/rbac";
import { NotFoundError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit/log";

// FR-07/NFR-05: Admin assigns or reassigns a trainee's sector, audited.
//
// TODO(open-item-2): sector reassignment mid-program — does quiz progress
// carry over or reset? Unresolved in CLAUDE.md. No quiz-attempt model exists
// yet (that's slice 4), so this is currently a no-op concern, but whoever
// adds attempt records must revisit this function before reassignment can
// silently coexist with in-progress quiz history.
export async function assignTraineeSector(session: Session | null, traineeId: string, sectorId: string) {
  requireRole(session, ["ADMIN"]);

  const sector = await prisma.sector.findUnique({ where: { id: sectorId } });
  if (!sector) throw new NotFoundError("Sector not found");

  const trainee = await prisma.user.findUnique({ where: { id: traineeId } });
  if (!trainee) throw new NotFoundError("Trainee not found");

  const previousSectorId = trainee.sectorId;

  const updated = await prisma.user.update({
    where: { id: traineeId },
    data: { sectorId },
  });

  await recordAudit(session.user.id, "trainee_sector_assigned", "User", traineeId, {
    previousSectorId,
    newSectorId: sectorId,
  });

  return updated;
}
