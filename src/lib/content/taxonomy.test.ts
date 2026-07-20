import { afterAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, UnauthenticatedError } from "@/lib/errors";
import { getFullTaxonomy, getMySectorContent } from "./taxonomy";

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

describe("getFullTaxonomy (GET /api/admin/sectors)", () => {
  it("rejects non-admin roles", async () => {
    await expect(getFullTaxonomy(sessionFor("u1", "TRAINEE"))).rejects.toThrow(ForbiddenError);
  });

  it("returns the full nested tree for ADMIN", async () => {
    const sectors = await getFullTaxonomy(sessionFor("admin", "ADMIN"));
    const services = sectors.find((s) => s.name === "الخدمات");
    expect(services).toBeDefined();
    expect(services!.subSectors.length).toBeGreaterThan(0);
    const unit = services!.subSectors[0].units.find((u) => u.skillType === "SOFT");
    expect(unit).toBeDefined();
    expect(unit!.lessons.length).toBeGreaterThan(0);
  });
});

describe("getMySectorContent (GET /api/content)", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: "unassigned-trainee@example.com" } });
  });

  it("throws UnauthenticatedError with no session", async () => {
    await expect(getMySectorContent(null)).rejects.toThrow(UnauthenticatedError);
  });

  it("returns only the caller's own assigned sector", async () => {
    const trainee = await prisma.user.findUniqueOrThrow({ where: { email: "trainee@example.com" } });
    const result = await getMySectorContent(sessionFor(trainee.id, "TRAINEE"));
    expect(result?.name).toBe("الخدمات");
    // Cross-sector isolation: the other seeded sectors must not appear.
    expect(result?.name).not.toBe("التجزئة");
  });

  it("returns null for a trainee with no sector assigned yet", async () => {
    const unassigned = await prisma.user.upsert({
      where: { email: "unassigned-trainee@example.com" },
      update: { sectorId: null },
      create: { email: "unassigned-trainee@example.com", role: "TRAINEE" },
    });
    const result = await getMySectorContent(sessionFor(unassigned.id, "TRAINEE"));
    expect(result).toBeNull();
  });
});
