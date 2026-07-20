import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

// NFR-05: audit trail of Admin actions.
export function recordAudit(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata?: Prisma.InputJsonValue,
) {
  return prisma.auditLog.create({
    data: { actorId, action, targetType, targetId, metadata },
  });
}
