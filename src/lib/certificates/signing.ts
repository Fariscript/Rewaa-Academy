import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

function loadPrivateKey() {
  const pem = process.env.CERTIFICATE_SIGNING_PRIVATE_KEY;
  if (!pem) throw new Error("CERTIFICATE_SIGNING_PRIVATE_KEY is not configured");
  return createPrivateKey(pem.replace(/\\n/g, "\n"));
}

export interface CertificateSignableFields {
  id: string;
  userId: string;
  sectorId: string;
  traineeName: string;
  completionDate: Date;
  issuedAt: Date;
}

// NFR-18: a deterministic, order-fixed string of every field that matters
// for authenticity — both signing and verification build this the same
// way, so any edit to any of these fields after issuance invalidates the
// signature.
export function canonicalCertificatePayload(fields: CertificateSignableFields): string {
  return [
    fields.id,
    fields.userId,
    fields.sectorId,
    fields.traineeName,
    fields.completionDate.toISOString(),
    fields.issuedAt.toISOString(),
  ].join("|");
}

export function signCertificate(fields: CertificateSignableFields): string {
  const key = loadPrivateKey();
  const payload = canonicalCertificatePayload(fields);
  return sign(null, Buffer.from(payload, "utf8"), key).toString("base64");
}

export function verifyCertificateSignature(fields: CertificateSignableFields, signatureBase64: string): boolean {
  const key = loadPrivateKey();
  const publicKey = createPublicKey(key);
  const payload = canonicalCertificatePayload(fields);
  try {
    return verify(null, Buffer.from(payload, "utf8"), publicKey, Buffer.from(signatureBase64, "base64"));
  } catch {
    return false;
  }
}
