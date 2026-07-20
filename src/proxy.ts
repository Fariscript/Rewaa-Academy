// Next.js 16 renamed the middleware convention to "proxy" — see AGENTS.md.
export { auth as proxy } from "@/auth";

export const config = {
  // Every route except Auth.js's own endpoints and the sign-in page — those
  // must stay reachable to an unauthenticated user, everything else is
  // gated by the `authorized` callback in src/auth.ts (NFR-02, NFR-04).
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
