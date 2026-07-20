import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { markLessonComplete } from "@/lib/content/lesson-completion";
import { toErrorResponse } from "@/lib/errors";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  try {
    const completion = await markLessonComplete(session, id);
    return NextResponse.json({ completion });
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
