"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BUTTON_CLASSES } from "@/components/ui/button";

// FR-12: the publish gate, operable. Publish applies to DRAFT items;
// unpublish withdraws a PUBLISHED one back to DRAFT (no content lost,
// no revision recorded — a pure status toggle). Server-side checks and
// audit entries live in the lib layer behind the routes.
export function ContentItemActions({ contentItemId, status }: { contentItemId: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "publish" | "unpublish") {
    setPending(action);
    setError(null);
    try {
      const response = await fetch(`/api/admin/content-items/${contentItemId}/${action}`, { method: "POST" });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      setError("تعذّر تنفيذ الإجراء.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "DRAFT" ? (
        <button type="button" onClick={() => act("publish")} disabled={pending !== null} className={BUTTON_CLASSES.primary}>
          {pending === "publish" ? "..." : "نشر"}
        </button>
      ) : null}
      {status === "PUBLISHED" ? (
        <button type="button" onClick={() => act("unpublish")} disabled={pending !== null} className={BUTTON_CLASSES.subtle}>
          {pending === "unpublish" ? "..." : "إلغاء النشر"}
        </button>
      ) : null}
      {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
    </div>
  );
}
