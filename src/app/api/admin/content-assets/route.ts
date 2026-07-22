import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { uploadContentAsset } from "@/lib/content/upload-asset";
import { toErrorResponse } from "@/lib/errors";

export async function POST(request: NextRequest) {
  const session = await auth();
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const type = formData.get("type");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "missing file" }, { status: 400 });
    }
    const asset = await uploadContentAsset(session, { type, file });
    return NextResponse.json({ asset });
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
