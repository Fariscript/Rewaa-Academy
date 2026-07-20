// Arabic locale with Western (latn) digits — matching the deliberate
// Western-digits choice in the certificate PDF pipeline (bidi-reordering
// bug, see HANDOFF.md) so numbers read the same across every surface.
const DATE_TIME = new Intl.DateTimeFormat("ar-u-nu-latn", { dateStyle: "medium", timeStyle: "short" });
const DATE_ONLY = new Intl.DateTimeFormat("ar-u-nu-latn", { dateStyle: "long" });

export function formatDateTime(value: Date): string {
  return DATE_TIME.format(value);
}

export function formatDate(value: Date): string {
  return DATE_ONLY.format(value);
}
