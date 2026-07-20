import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { gradeAnswer } from "@/lib/grading/grading";
import { toErrorResponse } from "@/lib/errors";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  try {
    const body = await request.json();
    const isCorrect = Boolean(body?.isCorrect);
    const feedback = typeof body?.feedback === "string" ? body.feedback : "";
    const answer = await gradeAnswer(session, id, isCorrect, feedback);
    return NextResponse.json({ answer });
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
