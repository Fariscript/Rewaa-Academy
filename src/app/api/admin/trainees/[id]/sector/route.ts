import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { assignTraineeSector } from "@/lib/admin/assign-sector";
import { toErrorResponse } from "@/lib/errors";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  try {
    const { sectorId } = await request.json();
    if (typeof sectorId !== "string" || !sectorId) {
      return NextResponse.json({ error: "sectorId is required" }, { status: 400 });
    }
    const trainee = await assignTraineeSector(session, id, sectorId);
    return NextResponse.json({ trainee });
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
