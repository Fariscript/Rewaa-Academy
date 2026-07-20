import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { retireQuestion } from "@/lib/questions/manage";
import { toErrorResponse } from "@/lib/errors";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  try {
    const question = await retireQuestion(session, id);
    return NextResponse.json({ question });
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
