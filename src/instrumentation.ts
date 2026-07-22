// Runs once when the Next.js server process starts (dev and start, Node
// runtime only — not during `next build`, and not in the edge runtime).
// Fails fast with a clear message on required env misconfiguration instead
// of surfacing an opaque error the first time a route touches it.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { loadCertificateSigningKey } = await import("./lib/certificates/signing");
  loadCertificateSigningKey();
}
