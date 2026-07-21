"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BUTTON_CLASSES } from "@/components/ui/button";

// Slice 10's cap override, operable from the dashboard: +1 attempt for one
// trainee on one quiz, with a required reason (audited server-side).
export function GrantAttemptButton({ traineeId, quizId }: { traineeId: string; quizId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function grant() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/attempt-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traineeId, quizId, reason }),
      });
      if (!response.ok) throw new Error();
      setOpen(false);
      setReason("");
      router.refresh();
    } catch {
      setError("تعذّر منح المحاولة.");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={BUTTON_CLASSES.subtle}>
        منح محاولة إضافية
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="السبب (إلزامي)"
        className="rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button
        type="button"
        onClick={grant}
        disabled={pending || !reason.trim()}
        className={BUTTON_CLASSES.subtle}
      >
        {pending ? "..." : "تأكيد"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className={BUTTON_CLASSES.subtle}>
        إلغاء
      </button>
      {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
    </div>
  );
}
