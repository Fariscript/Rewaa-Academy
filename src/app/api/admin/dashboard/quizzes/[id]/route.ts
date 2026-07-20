import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getQuizDashboard } from "@/lib/dashboard/quiz-dashboard";
import { toErrorResponse } from "@/lib/errors";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  try {
    const dashboard = await getQuizDashboard(session, id);
    return NextResponse.json(dashboard);
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
