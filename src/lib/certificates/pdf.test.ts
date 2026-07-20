import { describe, expect, it } from "vitest";
import { generateCertificatePdf, splitTextRuns } from "./pdf";

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

  it("renders a Latin trainee name without throwing (SSO names may not be Arabic)", async () => {
    const bytes = await generateCertificatePdf({
      id: "cert_test_456",
      traineeName: "Trainee Fixture",
      sectorName: "الخدمات",
      completionDate: new Date("2026-07-20T00:00:00.000Z"),
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString("utf8")).toBe("%PDF-");
  });
});

describe("splitTextRuns: script-run segmentation for mixed-font drawing", () => {
  it("splits Arabic text with embedded Western digits into alternating runs", () => {
    expect(splitTextRuns("بتاريخ 20 يوليو 2026")).toEqual([
      { text: "بتاريخ ", arabic: true },
      { text: "20", arabic: false },
      { text: " يوليو ", arabic: true },
      { text: "2026", arabic: false },
    ]);
  });

  it("keeps single-script text as one run", () => {
    expect(splitTextRuns("شهادة إتمام")).toEqual([{ text: "شهادة إتمام", arabic: true }]);
    expect(splitTextRuns("Trainee Fixture")).toEqual([{ text: "Trainee Fixture", arabic: false }]);
  });

  it("attaches boundary neutrals to the Arabic side of the boundary", () => {
    expect(splitTextRuns("قطاع الخدمات - Retail")).toEqual([
      { text: "قطاع الخدمات - ", arabic: true },
      { text: "Retail", arabic: false },
    ]);
    expect(splitTextRuns("Retail قطاع")).toEqual([
      { text: "Retail", arabic: false },
      { text: " قطاع", arabic: true },
    ]);
  });
});
