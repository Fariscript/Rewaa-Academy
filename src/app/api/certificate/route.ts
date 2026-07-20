import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCertificateStatus, issueOrGetCertificate } from "@/lib/certificates/certificate";
import { toErrorResponse } from "@/lib/errors";

// T-4: "auto-generates" — checking status issues the certificate as a side
// effect if the trainee is eligible and it doesn't exist yet (same lazy,
// computed-on-access pattern as T-32's auto-submit; see
// src/lib/certificates/certificate.ts).
export async function GET() {
  const session = await auth();
  try {
    const status = await getCertificateStatus(session);
    if (status.eligible && !status.certificate) {
      const certificate = await issueOrGetCertificate(session);
      return NextResponse.json({ ...status, certificate });
    }
    return NextResponse.json(status);
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
