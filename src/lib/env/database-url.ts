/**
 * Netlify's Postgres integration provisions NETLIFY_DATABASE_URL, not
 * DATABASE_URL — this resolves whichever one is actually set, falling back
 * automatically so a Netlify deploy doesn't need a manually duplicated env
 * var alongside the one Netlify already injects. DATABASE_URL wins if both
 * are set (e.g. local dev, where it's the only one that exists anyway).
 *
 * Used by both the app runtime (src/lib/prisma.ts) and the Prisma CLI
 * (prisma.config.ts, for `migrate deploy`/`db seed` during a Netlify build)
 * — plain relative import from prisma.config.ts, not the `@/` alias, since
 * that file is loaded outside the Next.js app bundle.
 */
export function resolveDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL ?? process.env.NETLIFY_DATABASE_URL;
}
