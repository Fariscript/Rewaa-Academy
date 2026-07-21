"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BUTTON_CLASSES } from "@/components/ui/button";

// T-11/T-12: the approval hard gate, operable. Approve/reject apply to
// DRAFT questions; retire withdraws an APPROVED one. All server-side
// checks and audit entries live in the lib layer behind the routes.
export function QuestionActions({ questionId, status }: { questionId: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "approve" | "reject" | "retire") {
    setPending(action);
    setError(null);
    try {
      const response = await fetch(`/api/admin/questions/${questionId}/${action}`, { method: "POST" });
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
        <>
          <button type="button" onClick={() => act("approve")} disabled={pending !== null} className={BUTTON_CLASSES.primary}>
            {pending === "approve" ? "..." : "اعتماد"}
          </button>
          <button type="button" onClick={() => act("reject")} disabled={pending !== null} className={BUTTON_CLASSES.secondary}>
            {pending === "reject" ? "..." : "رفض"}
          </button>
        </>
      ) : null}
      {status === "APPROVED" ? (
        <button type="button" onClick={() => act("retire")} disabled={pending !== null} className={BUTTON_CLASSES.subtle}>
          {pending === "retire" ? "..." : "سحب من التداول"}
        </button>
      ) : null}
      {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
    </div>
  );
}
