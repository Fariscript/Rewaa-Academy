import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { grantExtraAttempt } from "@/lib/admin/attempt-override";
import { toErrorResponse } from "@/lib/errors";

export async function POST(request: NextRequest) {
  const session = await auth();
  try {
    const { traineeId, quizId, reason } = await request.json();
    if (typeof traineeId !== "string" || !traineeId || typeof quizId !== "string" || !quizId) {
      return NextResponse.json({ error: "traineeId and quizId are required" }, { status: 400 });
    }
    if (typeof reason !== "string" || !reason.trim()) {
      return NextResponse.json({ error: "reason is required" }, { status: 400 });
    }
    const result = await grantExtraAttempt(session, traineeId, quizId, reason);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
