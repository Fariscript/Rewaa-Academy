import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Netlify runtime crash: "Failed to load external module pg-...: not in
  // import map" — pg (and @prisma/adapter-pg, which wraps it) wasn't
  // resolving correctly in the traced/bundled Node.js-runtime proxy.ts
  // function Next.js 16 requires. Leaving these as plain external requires
  // instead of tracing/bundling them is the standard fix for native/
  // Node-only packages breaking in traced serverless bundles.
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
};

export default nextConfig;
