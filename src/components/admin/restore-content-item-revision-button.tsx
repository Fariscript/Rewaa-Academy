"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BUTTON_CLASSES } from "@/components/ui/button";

// T-36: restore a prior revision. Server-side this archives the current
// content as a new revision first and resets status to DRAFT — history is
// never rewritten, and restored content still needs fresh publishing.
export function RestoreContentItemRevisionButton({
  contentItemId,
  revisionId,
}: {
  contentItemId: string;
  revisionId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/content-items/${contentItemId}/revisions/${revisionId}/restore`, {
        method: "POST",
      });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      setError("تعذّرت الاستعادة.");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button type="button" onClick={restore} disabled={pending} className={BUTTON_CLASSES.subtle}>
        {pending ? "..." : "استعادة هذه النسخة"}
      </button>
      {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
    </span>
  );
}
