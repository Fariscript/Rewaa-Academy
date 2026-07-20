import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getMySectorContent } from "@/lib/content/taxonomy";
import { toErrorResponse } from "@/lib/errors";

// FR-13: search/browse content within the caller's assigned sector only.
export async function GET() {
  const session = await auth();
  try {
    const sector = await getMySectorContent(session);
    return NextResponse.json({ sector });
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
