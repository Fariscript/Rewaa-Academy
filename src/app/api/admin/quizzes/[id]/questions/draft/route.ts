import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { draftQuestions } from "@/lib/questions/draft";
import { toErrorResponse } from "@/lib/errors";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const count = typeof body?.count === "number" && body.count > 0 ? Math.floor(body.count) : 5;
    const result = await draftQuestions(session, id, count);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
