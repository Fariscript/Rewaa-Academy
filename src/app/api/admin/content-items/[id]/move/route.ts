import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { moveContentItem } from "@/lib/content/content-items";
import { toErrorResponse } from "@/lib/errors";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  try {
    const body = await request.json();
    const direction = body?.direction;
    if (direction !== "up" && direction !== "down") {
      return NextResponse.json({ error: "direction must be 'up' or 'down'" }, { status: 400 });
    }
    const item = await moveContentItem(session, id, direction);
    return NextResponse.json({ item });
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
