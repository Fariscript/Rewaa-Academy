import { NextResponse, type NextRequest } from "next/server";
import { verifyCertificateById } from "@/lib/certificates/verify";

// Public — no session required (src/auth.ts's authorized callback carves
// this path out explicitly). See verify.ts for what "valid" means.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await verifyCertificateById(id);
  return NextResponse.json(result);
}
