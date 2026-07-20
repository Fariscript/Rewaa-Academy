import { describe, expect, it } from "vitest";
import { generateCertificatePdf } from "./pdf";

describe("generateCertificatePdf", () => {
  it("produces a valid, non-trivial PDF byte stream for Arabic content", async () => {
    const bytes = await generateCertificatePdf({
      id: "cert_test_123",
      traineeName: "فارس الغامدي",
      sectorName: "الخدمات",
      completionDate: new Date("2026-07-20T00:00:00.000Z"),
    });

    expect(bytes.length).toBeGreaterThan(1000);
    const header = Buffer.from(bytes.slice(0, 5)).toString("utf8");
    expect(header).toBe("%PDF-");
  });
});
