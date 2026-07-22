import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

const PEM_HEADER = "-----BEGIN PRIVATE KEY-----";
const PEM_FOOTER = "-----END PRIVATE KEY-----";

export class CertificateSigningKeyConfigError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CertificateSigningKeyConfigError";
  }
}

// Validates + parses CERTIFICATE_SIGNING_PRIVATE_KEY, replacing node:crypto's
// raw OpenSSL decoder error with a message that names the actual cause. The
// most common one: pasting the multi-line PEM straight from
// `privateKey.export(...)` into .env instead of the single-line \n-escaped,
// quoted format — dotenv/@next/env parse .env line-by-line, so a raw
// multi-line paste silently truncates to just the "-----BEGIN..." line.
// Exported so it can also run eagerly at server startup (see
// src/instrumentation.ts) instead of only failing lazily on first
// certificate issuance/verification.
export function loadCertificateSigningKey(
  rawEnvValue: string | undefined = process.env.CERTIFICATE_SIGNING_PRIVATE_KEY,
) {
  if (!rawEnvValue || rawEnvValue.trim() === "") {
    throw new CertificateSigningKeyConfigError(
      "CERTIFICATE_SIGNING_PRIVATE_KEY is not set. Generate one with the command documented in " +
        ".env.example (Certificate digital signature section) and paste the entire printed line into .env.",
    );
  }

  const normalized = rawEnvValue.replace(/\\n/g, "\n");

  if (!normalized.includes(PEM_HEADER) || !normalized.includes(PEM_FOOTER)) {
    throw new CertificateSigningKeyConfigError(
      "CERTIFICATE_SIGNING_PRIVATE_KEY is missing its PEM BEGIN/END markers. This almost always means " +
        "the multi-line PEM output was pasted directly into .env instead of the single-line, \\n-escaped, " +
        "quoted format — dotenv truncates a raw multi-line paste to just the first line. Re-generate " +
        "using the command in .env.example, which prints a ready-to-paste single line.",
    );
  }

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
