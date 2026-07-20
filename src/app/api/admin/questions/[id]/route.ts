import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { editQuestion } from "@/lib/questions/manage";
import { toErrorResponse } from "@/lib/errors";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  try {
    const body = await request.json();
    const question = await editQuestion(session, id, body);
    return NextResponse.json({ question });
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
