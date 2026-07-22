import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { unpublishContentItem } from "@/lib/content/content-items";
import { toErrorResponse } from "@/lib/errors";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  try {
    const item = await unpublishContentItem(session, id);
    return NextResponse.json({ item });
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
