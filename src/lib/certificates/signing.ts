import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import {
  CertificateSigningKeyConfigError,
  normalizeAndValidateCertificateSigningKeyFormat,
} from "./signing-config";

export { CertificateSigningKeyConfigError };

// Validates + parses CERTIFICATE_SIGNING_PRIVATE_KEY, replacing node:crypto's
// raw OpenSSL decoder error with a message that names the actual cause.
// Format validation (unset, missing PEM markers) lives in signing-config.ts,
// which deliberately has no node:crypto import — see that file for why
// (instrumentation.ts needs to run it without pulling node:crypto into the
// /instrumentation webpack bundle). This function adds the cryptographic
// parse on top, for callers that need the actual key object.
export function loadCertificateSigningKey(
  rawEnvValue: string | undefined = process.env.CERTIFICATE_SIGNING_PRIVATE_KEY,
) {
  const normalized = normalizeAndValidateCertificateSigningKeyFormat(rawEnvValue);

  try {
    return createPrivateKey(normalized);
  } catch (cause) {
    throw new CertificateSigningKeyConfigError(
      "CERTIFICATE_SIGNING_PRIVATE_KEY has BEGIN/END markers but its key content is invalid or truncated " +
        "(often a partial copy-paste, or missing \\n escapes between lines). Re-generate using the command " +
        "in .env.example rather than editing the value by hand.",
      { cause },
    );
  }
}

function loadPrivateKey() {
  return loadCertificateSigningKey();
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
