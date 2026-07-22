import type { ContentItemType } from "@/generated/prisma/client";

const ALL_TYPES: ContentItemType[] = ["VIDEO", "PDF", "ARTICLE", "IMAGE"];

export interface ContentItemContentInput {
  type: unknown;
  body?: unknown;
  assetId?: unknown;
}

export interface ValidContentItemContent {
  type: ContentItemType;
  // ARTICLE carries text/HTML directly. VIDEO/PDF/IMAGE reference an
  // already-uploaded ContentAsset instead — createContentItem/editContentItem
  // do the DB-level check that the referenced asset exists and matches
  // type; this function only validates shape, no DB access (same split as
  // validateQuestionContent).
  body: string | null;
  assetId: string | null;
}

export type ValidationResult =
  | { ok: true; value: ValidContentItemContent }
  | { ok: false; reason: string };

export function validateContentItemInput(input: ContentItemContentInput): ValidationResult {
  const { type, body, assetId } = input;

  if (typeof type !== "string" || !ALL_TYPES.includes(type as ContentItemType)) {
    return { ok: false, reason: `unsupported content item type: ${String(type)}` };
  }
  const contentType = type as ContentItemType;

  if (contentType === "ARTICLE") {
    if (typeof body !== "string" || body.trim().length === 0) {
      return { ok: false, reason: "empty or missing body for an ARTICLE item" };
    }
    return { ok: true, value: { type: contentType, body: body.trim(), assetId: null } };
  }

  if (typeof assetId !== "string" || assetId.trim().length === 0) {
    return { ok: false, reason: `missing assetId for a ${contentType} item` };
  }
  return { ok: true, value: { type: contentType, body: null, assetId } };
}
