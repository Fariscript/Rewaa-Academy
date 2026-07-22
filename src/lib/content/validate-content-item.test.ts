import { describe, expect, it } from "vitest";
import { validateContentItemInput } from "./validate-content-item";

describe("validateContentItemInput", () => {
  it("rejects an unsupported type", () => {
    const result = validateContentItemInput({ type: "AUDIO" });
    expect(result.ok).toBe(false);
  });

  it("rejects an ARTICLE with an empty or missing body", () => {
    expect(validateContentItemInput({ type: "ARTICLE" }).ok).toBe(false);
    expect(validateContentItemInput({ type: "ARTICLE", body: "   " }).ok).toBe(false);
  });

  it("accepts a valid ARTICLE, trims body, and forces assetId to null", () => {
    const result = validateContentItemInput({ type: "ARTICLE", body: "  نص المقال  ", assetId: "should-be-ignored" });
    expect(result).toEqual({ ok: true, value: { type: "ARTICLE", body: "نص المقال", assetId: null } });
  });

  it.each(["VIDEO", "PDF", "IMAGE"] as const)("rejects a %s item with an empty or missing assetId", (type) => {
    expect(validateContentItemInput({ type }).ok).toBe(false);
    expect(validateContentItemInput({ type, assetId: "  " }).ok).toBe(false);
  });

  it.each(["VIDEO", "PDF", "IMAGE"] as const)("accepts a valid %s item and forces body to null", (type) => {
    const result = validateContentItemInput({ type, assetId: "asset-1", body: "should-be-ignored" });
    expect(result).toEqual({ ok: true, value: { type, body: null, assetId: "asset-1" } });
  });
});
