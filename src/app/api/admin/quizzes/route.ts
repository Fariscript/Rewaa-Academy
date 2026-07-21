import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listQuizzesForAdmin } from "@/lib/dashboard/quiz-index";
import { toErrorResponse } from "@/lib/errors";

export async function GET() {
  const session = await auth();
  try {
    const quizzes = await listQuizzesForAdmin(session);
    return NextResponse.json({ quizzes });
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
