import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getQuizOutcome } from "@/lib/quiz/outcome";
import { toErrorResponse } from "@/lib/errors";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  try {
    const outcome = await getQuizOutcome(session, id);
    return NextResponse.json(outcome);
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
