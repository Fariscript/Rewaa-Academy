import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Any authenticated role can read their own profile (used by the client to
// know who's logged in and branch UI by role — e.g. FR-04's post-login redirect).
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { id, email, name, role } = session.user;
  return NextResponse.json({ id, email, name, role });
}
