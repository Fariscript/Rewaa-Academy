import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // src/lib/certificates/pdf.ts loads these via readFileSync(join(process.cwd(),
  // "node_modules/noto-sans-arabic/fonts/...")) — a dynamically-constructed path
  // (process.cwd() isn't a static literal), so whether the build's tracer picks it
  // up automatically is bundler-dependent. Verified directly: under Turbopack the
  // trace (.next/server/app/api/certificate/pdf/route.js.nft.json) included both
  // .ttf files; after switching "build" to --webpack for the pg/Turbopack
  // externals fix, that same trace file included neither — a real regression a
  // pruned Netlify function bundle would hit at runtime (font file missing,
  // certificate PDF generation crashes). Pinned explicitly here so it doesn't
  // depend on either bundler's tracer guessing right.
  outputFileTracingIncludes: {
    "/api/certificate/pdf": ["./node_modules/noto-sans-arabic/fonts/*.ttf"],
  },
};

export default nextConfig;
