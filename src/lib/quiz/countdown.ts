// T-32 display helpers for the visible countdown. Pure — the client timer
// only ever renders these; the server (syncExpiry) remains the authority on
// actual expiry.

export function remainingSeconds(expiresAt: Date, now: Date): number {
  return Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));
}

// "MM:SS", or "H:MM:SS" for limits of an hour or more. Western digits and
// LTR rendering are deliberate (see the certificate pipeline note in
// HANDOFF.md) — wrap in dir="ltr" at the render site.
export function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
