import { describe, expect, it } from "vitest";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { generateCertificatePdf, splitTextRuns, toWinAnsiSafe } from "./pdf";

async function embeddedBaseFonts(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.context
    .enumerateIndirectObjects()
    .map(([, obj]) => obj)
    .filter((obj): obj is PDFDict => obj instanceof PDFDict)
    .map((dict) => dict.get(PDFName.of("BaseFont")))
    .filter((value) => value !== undefined)
    .map((value) => String(value));
}

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

  it("draws Latin names and digits with an embedded Latin font, not the Arabic-only one", async () => {
    const bytes = await generateCertificatePdf({
      id: "cert_test_456",
      traineeName: "Trainee Fixture",
      sectorName: "الخدمات",
      completionDate: new Date("2026-07-20T00:00:00.000Z"),
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString("utf8")).toBe("%PDF-");
    // Regression guard for the tofu-box bug: missing glyphs do NOT throw
    // (pdf-lib silently draws .notdef), so inspect the parsed font
    // dictionaries — the fixed pipeline embeds Helvetica faces for the
    // Latin runs; the broken one used only the Arabic Noto fonts (plus
    // Courier for the verification line).
    const fonts = await embeddedBaseFonts(bytes);
    expect(fonts.some((name) => name.includes("Helvetica"))).toBe(true);
  });

  it("does not throw on names outside WinAnsi (replaced, not crashed)", async () => {
    const bytes = await generateCertificatePdf({
      id: "cert_test_789",
      traineeName: "Emre Şahin 李",
      sectorName: "الخدمات",
      completionDate: new Date("2026-07-20T00:00:00.000Z"),
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString("utf8")).toBe("%PDF-");
  });
});

describe("toWinAnsiSafe", () => {
  it("keeps ASCII and Latin-1, replaces everything else", () => {
    expect(toWinAnsiSafe("Trainee Fixture")).toBe("Trainee Fixture");
    expect(toWinAnsiSafe("Émile Noël")).toBe("Émile Noël");
    expect(toWinAnsiSafe("Emre Şahin 李")).toBe("Emre ?ahin ?");
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
