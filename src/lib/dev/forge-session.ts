import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session-policy";

/**
 * Forged database session for the staging quick-login buttons on /login
 * (gated by STAGING_QUICK_LOGIN_ENABLED — see isStagingQuickLoginEnabled)
 * — inserts a session row directly, same idea as scripts/smoke-e2e.ts's
 * forgeSession (skips the Google OAuth round-trip under the "database"
 * session strategy). That script uses its own standalone pg.Client by
 * design, independent of the app's Prisma client, so this is the in-app
 * equivalent for server components/actions rather than a literal shared
 * function — kept here so any other in-app caller reuses this instead of
 * re-deriving it.
 *
 * Sets the session cookie under BOTH names Auth.js might look up next
 * request. @auth/core picks the cookie name at request time via
 * `useSecureCookies = config.useSecureCookies ?? url.protocol === "https:"`
 * (src/auth.ts sets no override) — plain `authjs.session-token` over http,
 * `__Secure-authjs.session-token` once it sees https (e.g. behind Netlify's
 * TLS termination, or an ngrok tunnel's X-Forwarded-Proto in local testing).
 * Replicating that protocol detection here would be fragile for throwaway
 * demo code, so both names are set instead — whichever one Auth.js reads,
 * it finds a valid session.
 */
export async function forgeDevSession(email: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      id: `quick-login-${token.slice(0, 12)}`,
      sessionToken: token,
      userId: user.id,
      expires: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
    },
  });

  const cookieStore = await cookies();
  const maxAge = SESSION_MAX_AGE_SECONDS;
  cookieStore.set("authjs.session-token", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  cookieStore.set("__Secure-authjs.session-token", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: true,
    maxAge,
  });
}
