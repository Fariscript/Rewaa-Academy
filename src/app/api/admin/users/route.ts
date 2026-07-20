import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listUsers } from "@/lib/admin/list-users";
import { toErrorResponse } from "@/lib/auth/rbac";

export async function GET() {
  const session = await auth();
  try {
    const users = await listUsers(session);
    return NextResponse.json({ users });
  } catch (error) {
    return toErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
