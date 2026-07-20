import { describe, expect, it } from "vitest";
import type { Session } from "next-auth";
import { ForbiddenError, UnauthenticatedError } from "@/lib/errors";
import { requireRole } from "./rbac";

function sessionFor(role: Session["user"]["role"]): Session {
  return {
    user: { id: "u1", role, email: "u1@rewaa-example.com", name: "U1" },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

describe("requireRole", () => {
  it("throws UnauthenticatedError when there is no session", () => {
    expect(() => requireRole(null, ["ADMIN"])).toThrow(UnauthenticatedError);
  });

  it.each([
    ["TRAINEE", ["ADMIN"], false],
    ["TRAINER_TRAINING_MANAGER", ["ADMIN"], false],
    ["ADMIN", ["ADMIN"], true],
  ] as const)("role=%s allowed=%s -> %s", (role, allowed, shouldPass) => {
    const session = sessionFor(role);
    if (shouldPass) {
      expect(() => requireRole(session, [...allowed])).not.toThrow();
    } else {
      expect(() => requireRole(session, [...allowed])).toThrow(ForbiddenError);
    }
  });

  it("accepts any of several allowed roles", () => {
    const session = sessionFor("TRAINER_TRAINING_MANAGER");
    expect(() => requireRole(session, ["ADMIN", "TRAINER_TRAINING_MANAGER"])).not.toThrow();
  });
});
