import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { rejectQuestion } from "@/lib/questions/approve";
import { toErrorResponse } from "@/lib/errors";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  try {
    const question = await rejectQuestion(session, id);
    return NextResponse.json({ question });
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
