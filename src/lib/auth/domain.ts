import type { GoogleProfile } from "next-auth/providers/google";

/**
 * FR-02/FR-03/T-27: only Google Workspace accounts on the configured company
 * domain may sign in. `hd` is Google's hosted-domain claim, present only for
 * Workspace accounts (never for personal @gmail.com accounts) — it's the
 * authoritative signal. The verified-email suffix check is defense in depth
 * in case a future OIDC profile shape omits `hd`.
 */
export function isAllowedWorkspaceDomain(
  profile: Pick<GoogleProfile, "hd" | "email" | "email_verified"> | null | undefined,
  allowedDomain: string,
): boolean {
  if (!profile || !allowedDomain) return false;
  if (profile.hd) return profile.hd === allowedDomain;
  return Boolean(profile.email_verified && profile.email?.toLowerCase().endsWith(`@${allowedDomain.toLowerCase()}`));
}
