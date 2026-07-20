import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { submitAttempt } from "@/lib/quiz/submit-attempt";
import { toTraineeAttemptView } from "@/lib/quiz/attempt-view";
import { toErrorResponse } from "@/lib/errors";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  try {
    const attempt = await submitAttempt(session, id);
    // Redact through the trainee view — raw AttemptAnswer rows carry the
    // answer key (correctOption) and must never be serialized to the client.
    return NextResponse.json({ attempt: toTraineeAttemptView(attempt) });
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
