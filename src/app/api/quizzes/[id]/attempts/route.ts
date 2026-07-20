import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { startAttempt } from "@/lib/quiz/start-attempt";
import { toErrorResponse } from "@/lib/errors";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  try {
    const attempt = await startAttempt(session, id);
    return NextResponse.json({ attempt });
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
