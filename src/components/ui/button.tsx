// Shared button classes so plain <button>s, submit buttons in server-action
// forms, and Links can all look identical without a client boundary.
export const BUTTON_CLASSES = {
  primary:
    "inline-block rounded-md bg-neutral-900 px-5 py-2.5 font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300",
  secondary:
    "inline-block rounded-md border border-neutral-300 px-5 py-2.5 font-medium hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800",
  subtle:
    "inline-block rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800",
} as const;

export type ButtonVariant = keyof typeof BUTTON_CLASSES;
