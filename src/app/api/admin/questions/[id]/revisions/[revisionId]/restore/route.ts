import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { restoreRevision } from "@/lib/questions/revisions";
import { toErrorResponse } from "@/lib/errors";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; revisionId: string }> },
) {
  const session = await auth();
  const { id, revisionId } = await params;
  try {
    const question = await restoreRevision(session, id, revisionId);
    return NextResponse.json({ question });
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
