import { describe, expect, it } from "vitest";
import {
  CertificateSigningKeyConfigError,
  canonicalCertificatePayload,
  loadCertificateSigningKey,
  signCertificate,
  verifyCertificateSignature,
} from "./signing";

const fields = {
  id: "cert_1",
  userId: "user_1",
  sectorId: "sector_1",
  traineeName: "فارس الغامدي",
  completionDate: new Date("2026-07-20T00:00:00.000Z"),
  issuedAt: new Date("2026-07-20T12:00:00.000Z"),
};

describe("canonicalCertificatePayload", () => {
  it("is deterministic for identical inputs", () => {
    expect(canonicalCertificatePayload(fields)).toBe(canonicalCertificatePayload({ ...fields }));
  });

  it("changes if any field changes", () => {
    const base = canonicalCertificatePayload(fields);
    expect(canonicalCertificatePayload({ ...fields, traineeName: "شخص آخر" })).not.toBe(base);
    expect(canonicalCertificatePayload({ ...fields, sectorId: "sector_2" })).not.toBe(base);
  });
});

describe("signCertificate / verifyCertificateSignature", () => {
  it("round-trips: a fresh signature verifies against the same fields", () => {
    const signature = signCertificate(fields);
    expect(verifyCertificateSignature(fields, signature)).toBe(true);
  });

  it("fails verification if any field is tampered with after signing", () => {
    const signature = signCertificate(fields);
    expect(verifyCertificateSignature({ ...fields, traineeName: "اسم مزوّر" }, signature)).toBe(false);
    expect(verifyCertificateSignature({ ...fields, completionDate: new Date("2020-01-01") }, signature)).toBe(
      false,
    );
  });

  it("fails verification against a garbage signature", () => {
    expect(verifyCertificateSignature(fields, "not-a-real-signature")).toBe(false);
  });
});

describe("loadCertificateSigningKey", () => {
  const validSingleLine =
    '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIDCBO+Duf7yvCOaoxOJAAaXtWG6KA2oLuUFa58NQYUaI\n-----END PRIVATE KEY-----'.replace(
      /\n/g,
      "\\n",
    );

  it("loads a correctly-escaped single-line PEM", () => {
    expect(() => loadCertificateSigningKey(validSingleLine)).not.toThrow();
  });

  it("throws a clear, named error when the env var is the empty placeholder", () => {
    // Passing "" directly (rather than omitting the arg) avoids falling
    // through to the default parameter's real process.env value, which
    // .env.test always populates.
    expect(() => loadCertificateSigningKey("")).toThrow(CertificateSigningKeyConfigError);
    expect(() => loadCertificateSigningKey("")).toThrow(/is not set/);
  });

  it("throws a clear, named error when a raw multi-line PEM was pasted and truncated by dotenv", () => {
    // Simulates the real failure mode: dotenv parses .env line-by-line, so a
    // multi-line PEM pasted without \n escapes silently truncates to just
    // the BEGIN line by the time it reaches process.env.
    const truncatedByDotenv = "-----BEGIN PRIVATE KEY-----";
    expect(() => loadCertificateSigningKey(truncatedByDotenv)).toThrow(CertificateSigningKeyConfigError);
    expect(() => loadCertificateSigningKey(truncatedByDotenv)).toThrow(/BEGIN\/END markers/);
  });

  it("throws a clear, named error when markers are present but the key body is invalid", () => {
    const corruptBody = "-----BEGIN PRIVATE KEY-----\\nnot-valid-base64-key-content\\n-----END PRIVATE KEY-----";
    expect(() => loadCertificateSigningKey(corruptBody)).toThrow(CertificateSigningKeyConfigError);
    expect(() => loadCertificateSigningKey(corruptBody)).toThrow(/invalid or truncated/);
  });
});
