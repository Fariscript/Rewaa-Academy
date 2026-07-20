import { prisma } from "@/lib/prisma";
import { verifyCertificateSignature } from "./signing";

export interface CertificateVerification {
  valid: boolean;
  traineeName: string | null;
  sectorName: string | null;
  completionDate: Date | null;
  issuedAt: Date | null;
}

// NFR-18: public, no auth — anyone holding a certificate (e.g. an
// employer) can confirm it's genuine without an account. "Valid" means
// the row's own stored signature still matches a fresh recomputation over
// its current fields — if the DB row were edited directly (bypassing
// signCertificate), this would catch it.
export async function verifyCertificateById(certificateId: string): Promise<CertificateVerification> {
  const certificate = await prisma.certificate.findUnique({
    where: { id: certificateId },
    include: { sector: { select: { name: true } } },
  });
  if (!certificate) {
    return { valid: false, traineeName: null, sectorName: null, completionDate: null, issuedAt: null };
  }

  const valid = verifyCertificateSignature(
    {
      id: certificate.id,
      userId: certificate.userId,
      sectorId: certificate.sectorId,
      traineeName: certificate.traineeName,
      completionDate: certificate.completionDate,
      issuedAt: certificate.issuedAt,
    },
    certificate.signature,
  );

  return {
    valid,
    traineeName: certificate.traineeName,
    sectorName: certificate.sector.name,
    completionDate: certificate.completionDate,
    issuedAt: certificate.issuedAt,
  };
}
