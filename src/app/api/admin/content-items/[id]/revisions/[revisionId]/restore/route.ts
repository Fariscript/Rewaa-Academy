import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { restoreContentItemRevision } from "@/lib/content/content-item-revisions";
import { toErrorResponse } from "@/lib/errors";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; revisionId: string }> },
) {
  const session = await auth();
  const { id, revisionId } = await params;
  try {
    const item = await restoreContentItemRevision(session, id, revisionId);
    return NextResponse.json({ item });
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
