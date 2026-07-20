import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { listRevisions } from "@/lib/questions/revisions";
import { toErrorResponse } from "@/lib/errors";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  try {
    const revisions = await listRevisions(session, id);
    return NextResponse.json({ revisions });
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
