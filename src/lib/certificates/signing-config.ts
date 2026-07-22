const PEM_HEADER = "-----BEGIN PRIVATE KEY-----";
const PEM_FOOTER = "-----END PRIVATE KEY-----";

export class CertificateSigningKeyConfigError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CertificateSigningKeyConfigError";
  }
}

// Format-only validation for CERTIFICATE_SIGNING_PRIVATE_KEY — deliberately
// has NO node:crypto import. instrumentation.ts's startup check runs inside
// the webpack bundle Next.js builds for the special `/instrumentation`
// entry, which — found the hard way, running `next dev --webpack` for a
// demo — does not resolve node:crypto (or bare "crypto") at all in that
// bundling context, unlike every normal route/API handler. Anything
// instrumentation.ts calls at startup must not transitively import it, so
// the two most common failure modes (unset, truncated multi-line PEM
// pasted into .env) live here as pure string checks; the full cryptographic
// parse (createPrivateKey) stays in signing.ts and is still only checked
// lazily on first real certificate use for the narrower "has markers but
// corrupt body" case — that one check is no longer eager at boot.
export function normalizeAndValidateCertificateSigningKeyFormat(
  rawEnvValue: string | undefined = process.env.CERTIFICATE_SIGNING_PRIVATE_KEY,
): string {
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

  return normalized;
}
