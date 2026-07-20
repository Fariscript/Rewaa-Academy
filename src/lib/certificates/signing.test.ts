import { describe, expect, it } from "vitest";
import { canonicalCertificatePayload, signCertificate, verifyCertificateSignature } from "./signing";

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
