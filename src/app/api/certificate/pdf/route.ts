import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { issueOrGetCertificate } from "@/lib/certificates/certificate";
import { generateCertificatePdf } from "@/lib/certificates/pdf";
import { toErrorResponse } from "@/lib/errors";

export async function GET() {
  const session = await auth();
  try {
    const certificate = await issueOrGetCertificate(session);
    const sector = await prisma.sector.findUniqueOrThrow({ where: { id: certificate.sectorId } });
    const pdfBytes = await generateCertificatePdf({
      id: certificate.id,
      traineeName: certificate.traineeName,
      sectorName: sector.name,
      completionDate: certificate.completionDate,
    });
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="certificate-${certificate.id}.pdf"`,
      },
    });
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
