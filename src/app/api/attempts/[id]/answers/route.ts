import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { saveAnswers, type AnswerInput } from "@/lib/quiz/save-answers";
import { toTraineeAttemptView } from "@/lib/quiz/attempt-view";
import { toErrorResponse } from "@/lib/errors";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  try {
    const body = await request.json();
    const answers: AnswerInput[] = Array.isArray(body?.answers) ? body.answers : [];
    const attempt = await saveAnswers(session, id, answers);
    // Redact through the trainee view — raw AttemptAnswer rows carry the
    // answer key (correctOption) and must never be serialized to the client.
    return NextResponse.json({ attempt: toTraineeAttemptView(attempt) });
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
