import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listPendingGrading } from "@/lib/grading/grading";
import { toErrorResponse } from "@/lib/errors";

export async function GET() {
  const session = await auth();
  try {
    const answers = await listPendingGrading(session);
    return NextResponse.json({ answers });
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
