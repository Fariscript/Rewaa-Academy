import { describe, expect, it } from "vitest";
import { isAllowedWorkspaceDomain } from "./domain";

const ALLOWED = "rewaa-example.com";

describe("isAllowedWorkspaceDomain", () => {
  it("allows a Workspace account whose hosted-domain claim matches", () => {
    const profile = { hd: ALLOWED, email: "sara@rewaa-example.com", email_verified: true };
    expect(isAllowedWorkspaceDomain(profile, ALLOWED)).toBe(true);
  });

  it("rejects a Workspace account on a different hosted domain", () => {
    const profile = { hd: "other-company.com", email: "sara@other-company.com", email_verified: true };
    expect(isAllowedWorkspaceDomain(profile, ALLOWED)).toBe(false);
  });

  it("rejects a personal Google account with no hosted-domain claim and a non-matching email", () => {
    const profile = { hd: undefined, email: "sara@gmail.com", email_verified: true };
    expect(isAllowedWorkspaceDomain(profile, ALLOWED)).toBe(false);
  });

  it("falls back to a verified email-suffix match when hd is absent", () => {
    const profile = { hd: undefined, email: "sara@rewaa-example.com", email_verified: true };
    expect(isAllowedWorkspaceDomain(profile, ALLOWED)).toBe(true);
  });

  it("rejects an unverified email even if the suffix matches", () => {
    const profile = { hd: undefined, email: "sara@rewaa-example.com", email_verified: false };
    expect(isAllowedWorkspaceDomain(profile, ALLOWED)).toBe(false);
  });

  it("rejects when there is no profile at all", () => {
    expect(isAllowedWorkspaceDomain(null, ALLOWED)).toBe(false);
    expect(isAllowedWorkspaceDomain(undefined, ALLOWED)).toBe(false);
  });
});
