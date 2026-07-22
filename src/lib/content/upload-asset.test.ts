import { rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError } from "@/lib/errors";
import { uploadContentAsset } from "./upload-asset";

function sessionFor(id: string, role: Session["user"]["role"]): Session {
  return {
    user: { id, role, email: `${id}@rewaa-example.com`, name: id },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "content-assets");
const createdAssetIds: string[] = [];

function makeFile(name: string, contents: string, type: string): File {
  return new File([contents], name, { type });
}

describe("uploadContentAsset", () => {
  afterAll(async () => {
    await prisma.contentAsset.deleteMany({ where: { id: { in: createdAssetIds } } });
    // Dev-only local-disk storage (see upload-asset.ts) — clean up what this
    // test file actually wrote rather than the whole shared upload dir.
    await rm(UPLOAD_DIR, { recursive: true, force: true }).catch(() => {});
  });

  it("rejects non-admin callers", async () => {
    await expect(
      uploadContentAsset(sessionFor("caller", "TRAINEE"), { type: "PDF", file: makeFile("x.pdf", "x", "application/pdf") }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("rejects an unsupported asset type", async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    await expect(
      uploadContentAsset(sessionFor(admin.id, "ADMIN"), { type: "ARTICLE", file: makeFile("x.pdf", "x", "application/pdf") }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("rejects an empty file", async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    await expect(
      uploadContentAsset(sessionFor(admin.id, "ADMIN"), { type: "PDF", file: makeFile("empty.pdf", "", "application/pdf") }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("writes the file to disk, creates a ContentAsset row, and audits the upload", async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
    const asset = await uploadContentAsset(sessionFor(admin.id, "ADMIN"), {
      type: "PDF",
      file: makeFile("brochure.pdf", "%PDF-1.4 fake content", "application/pdf"),
    });
    createdAssetIds.push(asset.id);

    expect(asset.type).toBe("PDF");
    expect(asset.originalName).toBe("brochure.pdf");
    expect(asset.mimeType).toBe("application/pdf");
    expect(asset.sizeBytes).toBeGreaterThan(0);
    expect(asset.url.startsWith("/uploads/content-assets/")).toBe(true);
    expect(asset.uploadedById).toBe(admin.id);

    const diskPath = path.join(process.cwd(), "public", asset.url.replace(/^\//, ""));
    const { readFile } = await import("node:fs/promises");
    const written = await readFile(diskPath, "utf-8");
    expect(written).toBe("%PDF-1.4 fake content");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "content_asset_uploaded", targetId: asset.id },
    });
    expect(audit).toBeDefined();
    expect(audit?.actorId).toBe(admin.id);
  });
});
