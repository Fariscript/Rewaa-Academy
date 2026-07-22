// Runs once when the Next.js server process starts (dev and start, Node
// runtime only — not during `next build`, and not in the edge runtime).
// Fails fast with a clear message on required env misconfiguration instead
// of surfacing an opaque error the first time a route touches it.
//
// Imports signing-config.ts, NOT signing.ts: signing.ts pulls in
// node:crypto, and this file found the hard way (running `next dev
// --webpack` for a demo) that the webpack bundle Next.js builds for this
// specific `/instrumentation` entry does not resolve node:crypto (or the
// bare "crypto" specifier) at all — unlike every normal route/API handler.
// signing-config.ts's format check (unset var, truncated multi-line PEM
// paste) is pure string logic with no such dependency, so it's what runs
// eagerly here; the full cryptographic parse still happens, just lazily on
// first real certificate use, same as before this file existed.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { normalizeAndValidateCertificateSigningKeyFormat } = await import(
    "./lib/certificates/signing-config"
  );
  normalizeAndValidateCertificateSigningKeyFormat();
}
