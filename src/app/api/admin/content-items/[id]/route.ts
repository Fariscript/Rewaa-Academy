import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { editContentItem } from "@/lib/content/content-items";
import { toErrorResponse } from "@/lib/errors";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  try {
    const body = await request.json();
    const item = await editContentItem(session, id, body);
    return NextResponse.json({ item });
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
