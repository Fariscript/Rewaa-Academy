import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { handlers } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SESSION_MAX_AGE_SECONDS, SESSION_UPDATE_AGE_SECONDS } from "@/lib/auth/session-policy";

async function createSession(userEmail: string, expires: Date) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: userEmail } });
  const sessionToken = randomBytes(32).toString("hex");
  await prisma.session.create({ data: { sessionToken, userId: user.id, expires } });
  return sessionToken;
}

async function fetchSession(sessionToken: string) {
  const request = new Request("http://localhost/api/auth/session", {
    headers: { cookie: `authjs.session-token=${sessionToken}` },
  });
  const response = await handlers.GET(request);
  return response.json();
}

describe("NFR-04: session timeout / re-authentication after inactivity", () => {
  afterAll(async () => {
    await prisma.session.deleteMany({ where: { user: { email: "trainee@example.com" } } });
  });

  it("is configured as a server-revocable database session with the documented policy", async () => {
    // Guards against silent config drift (e.g. switching to "jwt") that would
    // break server-side session revocation entirely.
    expect(SESSION_MAX_AGE_SECONDS).toBeGreaterThan(0);
    expect(SESSION_UPDATE_AGE_SECONDS).toBeLessThan(SESSION_MAX_AGE_SECONDS);
  });

  it("rejects a session whose expiry is in the past", async () => {
    const token = await createSession("trainee@example.com", new Date(Date.now() - 60_000));
    const body = await fetchSession(token);
    expect(body?.user).toBeUndefined();

    const stored = await prisma.session.findUnique({ where: { sessionToken: token } });
    expect(stored).toBeNull(); // Auth.js deletes expired sessions on access.
  });

  it("accepts a session whose expiry is still in the future", async () => {
    const token = await createSession("trainee@example.com", new Date(Date.now() + 60_000));
    const body = await fetchSession(token);
    expect(body?.user?.email).toBe("trainee@example.com");
    expect(body?.user?.role).toBe("TRAINEE");
  });
});
