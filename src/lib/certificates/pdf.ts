import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Verified empirically (see commit history) before landing this: pdf-lib +
// @pdf-lib/fontkit render Arabic correctly (shaped, connected letterforms)
// ONLY when the embedded font is a full, non-subsetted OpenType file that
// still carries its GSUB contextual-shaping table. Web-optimized font
// packages (e.g. Fontsource's per-script WOFF/WOFF2 subsets) strip that
// table, since browsers do shaping themselves — pdf-lib does not, so text
// drawn with those fonts renders as disconnected glyphs or blank. This
// package ships raw, full .ttf files, and needs no reshaping library.
const ARABIC_REGULAR_PATH = join(
  process.cwd(),
  "node_modules/noto-sans-arabic/fonts/Regular.ttf",
);
const ARABIC_BOLD_PATH = join(process.cwd(), "node_modules/noto-sans-arabic/fonts/Bold.ttf");

const ARABIC_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

// Western digits deliberately, not Arabic-Indic (٠-٩) — mixing
// right-to-left Arabic text with Arabic-Indic numerals hits bidi
// reordering issues in this rendering pipeline (verified empirically);
// Western digits inside Arabic text sidestep that entirely and are
// standard practice in Gulf business documents regardless.
function formatArabicDate(date: Date): string {
  return `${date.getDate()} ${ARABIC_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export interface CertificatePdfInput {
  id: string;
  traineeName: string;
  sectorName: string;
  completionDate: Date;
}

export async function generateCertificatePdf(input: CertificatePdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const arabicRegular = await pdfDoc.embedFont(readFileSync(ARABIC_REGULAR_PATH));
  const arabicBold = await pdfDoc.embedFont(readFileSync(ARABIC_BOLD_PATH));
  // Latin/ASCII content (the verification code) needs a separate font —
  // the Arabic-only font has no Latin glyphs.
  const latin = await pdfDoc.embedFont(StandardFonts.Courier);

  const page = pdfDoc.addPage([595, 420]); // A5 landscape-ish
  const centerX = 595 / 2;

  const drawCentered = (text: string, y: number, size: number, font: typeof arabicBold, color = rgb(0, 0, 0)) => {
    const width = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: centerX - width / 2, y, size, font, color });
  };

  page.drawRectangle({
    x: 20,
    y: 20,
    width: 555,
    height: 380,
    borderColor: rgb(0.6, 0.6, 0.6),
    borderWidth: 1,
  });

  drawCentered("شهادة إتمام", 330, 32, arabicBold);
  drawCentered("تُمنح هذه الشهادة إلى", 270, 14, arabicRegular, rgb(0.3, 0.3, 0.3));
  drawCentered(input.traineeName, 235, 26, arabicBold);
  drawCentered(
    `لإتمامه جميع الاختبارات المطلوبة في قطاع ${input.sectorName}`,
    195,
    14,
    arabicRegular,
    rgb(0.2, 0.2, 0.2),
  );
  drawCentered(`بتاريخ ${formatArabicDate(input.completionDate)}`, 170, 14, arabicRegular, rgb(0.2, 0.2, 0.2));

  page.drawText(`Verification code: ${input.id}`, {
    x: 40,
    y: 40,
    size: 9,
    font: latin,
    color: rgb(0.5, 0.5, 0.5),
  });

  return pdfDoc.save();
}
