"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BUTTON_CLASSES } from "@/components/ui/button";

// T-33: the literal Start button — the attempt (and its timer) begins only
// when the trainee taps this; nothing auto-launches on unlock.
export function StartQuizButton({ quizId, label = "ابدأ الاختبار" }: { quizId: string; label?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/quizzes/${quizId}/attempts`, { method: "POST" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.attempt?.id) throw new Error();
      router.push(`/attempts/${body.attempt.id}`);
    } catch {
      setError("تعذّر بدء الاختبار، حاول مرة أخرى.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" onClick={start} disabled={pending} className={BUTTON_CLASSES.primary}>
        {pending ? "جارٍ البدء..." : label}
      </button>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
