import { afterAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { assignTraineeSector } from "./assign-sector";
import { getMySectorContent } from "@/lib/content/taxonomy";

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

async function ensureTrainee(email: string) {
  return prisma.user.upsert({
    where: { email },
    update: { sectorId: null },
    create: { email, role: "TRAINEE" },
  });
}

describe("assignTraineeSector (PATCH /api/admin/trainees/:id/sector)", () => {
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { targetType: "User", action: "trainee_sector_assigned" } });
    await prisma.user.deleteMany({ where: { email: "assign-sector-fixture@example.com" } });
  });

  it("rejects non-admin callers", async () => {
    const trainee = await ensureTrainee("assign-sector-fixture@example.com");
    const services = await prisma.sector.findUniqueOrThrow({ where: { name: "الخدمات" } });
    await expect(
      assignTraineeSector(sessionFor("caller", "TRAINER_TRAINING_MANAGER"), trainee.id, services.id),
    ).rejects.toThrow(ForbiddenError);
  });

  it("404s on an unknown sector or trainee", async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    const trainee = await ensureTrainee("assign-sector-fixture@example.com");
    await expect(
      assignTraineeSector(sessionFor(admin.id, "ADMIN"), trainee.id, "does-not-exist"),
    ).rejects.toThrow(NotFoundError);
    const services = await prisma.sector.findUniqueOrThrow({ where: { name: "الخدمات" } });
    await expect(
      assignTraineeSector(sessionFor(admin.id, "ADMIN"), "does-not-exist", services.id),
    ).rejects.toThrow(NotFoundError);
  });

  it("assigns the sector, audits the change, and takes effect immediately", async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    const trainee = await ensureTrainee("assign-sector-fixture@example.com");
    const retail = await prisma.sector.findUniqueOrThrow({ where: { name: "التجزئة" } });

    const updated = await assignTraineeSector(sessionFor(admin.id, "ADMIN"), trainee.id, retail.id);
    expect(updated.sectorId).toBe(retail.id);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "trainee_sector_assigned", targetId: trainee.id },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeDefined();
    expect(audit?.actorId).toBe(admin.id);
    expect((audit?.metadata as { newSectorId: string })?.newSectorId).toBe(retail.id);

    // No caching/throttle window: the scoped-content read reflects the
    // reassignment right away.
    const content = await getMySectorContent(sessionFor(trainee.id, "TRAINEE"));
    expect(content?.name).toBe("التجزئة");
  });
});
