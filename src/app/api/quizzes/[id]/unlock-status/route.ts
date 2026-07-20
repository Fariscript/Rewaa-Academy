import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { isQuizUnlocked } from "@/lib/content/quiz-unlock";
import { toErrorResponse } from "@/lib/errors";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  try {
    const unlocked = await isQuizUnlocked(session, id);
    return NextResponse.json({ unlocked });
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
