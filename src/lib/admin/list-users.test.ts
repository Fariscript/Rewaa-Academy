import { describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { ForbiddenError, UnauthenticatedError } from "@/lib/errors";
import { listUsers } from "./list-users";

function sessionFor(role: Session["user"]["role"]): Session {
  return {
    user: { id: "u1", role, email: `${role.toLowerCase()}@rewaa-example.com`, name: role },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

describe("listUsers (GET /api/admin/users)", () => {
  it("returns 401-equivalent (throws UnauthenticatedError) with no session", async () => {
    await expect(listUsers(null)).rejects.toThrow(UnauthenticatedError);
  });

  it("rejects role=TRAINEE with ForbiddenError", async () => {
    await expect(listUsers(sessionFor("TRAINEE"))).rejects.toThrow(ForbiddenError);
  });

  it("allows ADMIN and returns at least the seeded fixture users", async () => {
    // Not an exact-set match: other test files create their own short-lived
    // fixture users against this same DB, and vitest runs files concurrently
    // by default, so other users may legitimately exist at the same time.
    const users = await listUsers(sessionFor("ADMIN"));
    const emails = users.map((u) => u.email);
    expect(emails).toEqual(expect.arrayContaining(["admin@example.com", "trainee@example.com"]));
  });
});
