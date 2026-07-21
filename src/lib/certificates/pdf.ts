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

const ARABIC_CHAR = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export interface TextRun {
  text: string;
  arabic: boolean;
}

// The Arabic font carries no Latin glyphs or ASCII digits (they render as
// tofu boxes — bitten by this with SSO trainee names like "Trainee
// Fixture" and the Western digits in the date line), so every line is
// split into script runs and each run is drawn with a font that actually
// has its glyphs.
//
// Boundary neutrals (spaces, punctuation) always attach to the ARABIC side
// of a script boundary. Verified empirically against both alternatives:
// run boxes are placed right-to-left, a Latin run renders its characters
// LTR from the box's left edge (so its edge spaces land right of its
// digits — the wrong side of both boundaries), while an Arabic run is
// shaped RTL (logical-leading space renders at its right edge, trailing at
// its left — exactly the two boundary positions).
export function splitTextRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let pendingNeutral = "";
  for (const char of text) {
    const arabic = ARABIC_CHAR.test(char);
    const neutral = !arabic && !/[0-9A-Za-z]/.test(char);
    if (neutral) {
      pendingNeutral += char;
      continue;
    }
    const current = runs[runs.length - 1];
    if (current && current.arabic === arabic) {
      current.text += pendingNeutral + char;
    } else if (current && current.arabic && !arabic) {
      // Arabic → Latin boundary: neutral trails the Arabic run.
      current.text += pendingNeutral;
      runs.push({ text: char, arabic });
    } else {
      // Latin → Arabic boundary (or start of text): neutral leads the new run.
      runs.push({ text: pendingNeutral + char, arabic });
    }
    pendingNeutral = "";
  }
  if (pendingNeutral) {
    const current = runs[runs.length - 1];
    if (current) current.text += pendingNeutral;
    else runs.push({ text: pendingNeutral, arabic: false });
  }
  return runs;
}

// Standard fonts encode WinAnsi only — a name containing a character
// outside it (Turkish Ş, Cyrillic, CJK, ...) would make
// widthOfTextAtSize/drawText THROW and fail the whole certificate.
// Replace anything unencodable with "?" instead: a rare odd glyph on an
// edge-case name beats a hard 500 on download. (Safe subset of WinAnsi:
// printable ASCII, the Latin-1 supplement, and CP1252 punctuation.)
const WINANSI_SAFE = /[\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC\u0152\u0153\u0160\u0161\u017D\u017E\u0178\u2122]/;
export function toWinAnsiSafe(text: string): string {
  return [...text].map((char) => (WINANSI_SAFE.test(char) ? char : "?")).join("");
}

export async function generateCertificatePdf(input: CertificatePdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const arabicRegular = await pdfDoc.embedFont(readFileSync(ARABIC_REGULAR_PATH));
  const arabicBold = await pdfDoc.embedFont(readFileSync(ARABIC_BOLD_PATH));
  // Latin/ASCII runs (names, digits, the verification code) need separate
  // fonts — see splitTextRuns above. Standard fonts cover WinAnsi only,
  // which is fine for SSO names at a Latin-or-Arabic workplace.
  const latinRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const latinBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const latinMono = await pdfDoc.embedFont(StandardFonts.Courier);

  const page = pdfDoc.addPage([595, 420]); // A5 landscape-ish
  const centerX = 595 / 2;

  // Draws one centered line of (possibly mixed-script) text. Runs are laid
  // out right-to-left — the base direction of every line on this
  // certificate — so an embedded Latin/digit run takes its slot in the RTL
  // flow while its own characters still read left-to-right.
  const drawCentered = (
    text: string,
    y: number,
    size: number,
    fonts: { arabic: typeof arabicBold; latin: typeof latinBold },
    color = rgb(0, 0, 0),
  ) => {
    const runs = splitTextRuns(text);
    const measured = runs.map((run) => {
      const font = run.arabic ? fonts.arabic : fonts.latin;
      const runText = run.arabic ? run.text : toWinAnsiSafe(run.text);
      return { runText, font, width: font.widthOfTextAtSize(runText, size) };
    });
    const total = measured.reduce((sum, m) => sum + m.width, 0);
    let x = centerX + total / 2; // right edge; runs advance leftward
    for (const m of measured) {
      x -= m.width;
      page.drawText(m.runText, { x, y, size, font: m.font, color });
    }
  };

  page.drawRectangle({
    x: 20,
    y: 20,
    width: 555,
    height: 380,
    borderColor: rgb(0.6, 0.6, 0.6),
    borderWidth: 1,
  });

  const bold = { arabic: arabicBold, latin: latinBold };
  const regular = { arabic: arabicRegular, latin: latinRegular };

  drawCentered("شهادة إتمام", 330, 32, bold);
  drawCentered("تُمنح هذه الشهادة إلى", 270, 14, regular, rgb(0.3, 0.3, 0.3));
  drawCentered(input.traineeName, 235, 26, bold);
  drawCentered(
    `لإتمامه جميع الاختبارات المطلوبة في قطاع ${input.sectorName}`,
    195,
    14,
    regular,
    rgb(0.2, 0.2, 0.2),
  );
  drawCentered(`بتاريخ ${formatArabicDate(input.completionDate)}`, 170, 14, regular, rgb(0.2, 0.2, 0.2));

  page.drawText(`Verification code: ${input.id}`, {
    x: 40,
    y: 40,
    size: 9,
    font: latinMono,
    color: rgb(0.5, 0.5, 0.5),
  });

  return pdfDoc.save();
}
