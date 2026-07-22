import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { createContentItem } from "@/lib/content/content-items";
import { toErrorResponse } from "@/lib/errors";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  try {
    const body = await request.json();
    const item = await createContentItem(session, id, body);
    return NextResponse.json({ item });
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
