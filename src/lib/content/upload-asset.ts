import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/rbac";
import { ForbiddenError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit/log";
import type { ContentItemType } from "@/generated/prisma/client";

const ASSET_TYPES: ContentItemType[] = ["VIDEO", "PDF", "IMAGE"];
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "content-assets");
const MAX_SIZE_BYTES = 200 * 1024 * 1024;

// Dev-only local-disk storage. The real storage backend (S3/Vercel Blob/
// etc.) is an explicitly undecided, held-open question — see CLAUDE.md's
// "Handoff to testing-engine track". This exists so the admin UI is usable
// today; swapping the backend later only touches this file — ContentAsset's
// shape (an opaque `url` string) and every caller stay the same. NOT
// production-viable as-is: most hosts have an ephemeral filesystem and this
// has no CDN/multi-instance story.
export async function uploadContentAsset(session: Session | null, input: { type: unknown; file: File }) {
  requireRole(session, ["ADMIN"]);

  const { type, file } = input;
  if (typeof type !== "string" || !ASSET_TYPES.includes(type as ContentItemType)) {
    throw new ForbiddenError(`unsupported asset type: ${String(type)}`);
  }
  if (file.size === 0) throw new ForbiddenError("empty file");
  if (file.size > MAX_SIZE_BYTES) throw new ForbiddenError("file exceeds the 200MB dev-upload limit");

  await mkdir(UPLOAD_DIR, { recursive: true });
  const ext = path.extname(file.name);
  const diskName = `${randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, diskName), buffer);

  const asset = await prisma.contentAsset.create({
    data: {
      type: type as ContentItemType,
      url: `/uploads/content-assets/${diskName}`,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      originalName: file.name,
      uploadedById: session.user.id,
    },
  });

  await recordAudit(session.user.id, "content_asset_uploaded", "ContentAsset", asset.id, {
    originalName: file.name,
    sizeBytes: file.size,
  });

  return asset;
}
