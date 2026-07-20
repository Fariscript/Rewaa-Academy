import { describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { ForbiddenError, UnauthenticatedError } from "@/lib/auth/rbac";
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

  it.each(["TRAINEE", "TRAINER_TRAINING_MANAGER"] as const)(
    "rejects role=%s with ForbiddenError",
    async (role) => {
      await expect(listUsers(sessionFor(role))).rejects.toThrow(ForbiddenError);
    },
  );

  it("allows ADMIN and returns the seeded fixture users", async () => {
    const users = await listUsers(sessionFor("ADMIN"));
    const emails = users.map((u) => u.email).sort();
    expect(emails).toEqual(["admin@example.com", "trainee@example.com", "trainer@example.com"]);
  });
});
