import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getAttemptForTrainee } from "@/lib/quiz/attempt-view";
import { toErrorResponse } from "@/lib/errors";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  try {
    const attempt = await getAttemptForTrainee(session, id);
    return NextResponse.json({ attempt });
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
