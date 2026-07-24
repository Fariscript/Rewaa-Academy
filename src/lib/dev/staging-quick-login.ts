/**
 * Quick-login (the Admin/Trainee forged-session buttons on /login) is meant
 * for a Netlify *staging* deploy only, gated by STAGING_QUICK_LOGIN_ENABLED.
 * As a fail-safe against that flag being left on by mistake once a real
 * Netlify production site exists, this also refuses to activate under
 * Netlify's own production build context (NETLIFY + CONTEXT=production)
 * regardless of the flag — an unauthenticated login bypass reaching a real
 * production deploy would be far worse than staging quick-login being
 * unavailable when someone forgot to flip a flag.
 *
 * Revisit this the moment a real production Netlify site exists: right now
 * "Netlify production context" and "the only Netlify site there is" are the
 * same thing, which is what makes this safe-by-default. Once staging and
 * production are both real Netlify sites, confirm this still tells them
 * apart correctly before relying on it.
 */
export function isStagingQuickLoginEnabled(): boolean {
  if (process.env.STAGING_QUICK_LOGIN_ENABLED !== "true") return false;
  const isNetlifyProductionContext = process.env.NETLIFY === "true" && process.env.CONTEXT === "production";
  return !isNetlifyProductionContext;
}
