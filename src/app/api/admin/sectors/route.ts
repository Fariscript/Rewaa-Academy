import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getFullTaxonomy } from "@/lib/content/taxonomy";
import { toErrorResponse } from "@/lib/errors";

export async function GET() {
  const session = await auth();
  try {
    const sectors = await getFullTaxonomy(session);
    return NextResponse.json({ sectors });
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
