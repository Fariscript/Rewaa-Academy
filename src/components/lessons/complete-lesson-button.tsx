"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BUTTON_CLASSES } from "@/components/ui/button";

export function CompleteLessonButton({ lessonId }: { lessonId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function complete() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/lessons/${lessonId}/complete`, { method: "POST" });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      setError("تعذّر حفظ إكمال الدرس، حاول مرة أخرى.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" onClick={complete} disabled={pending} className={BUTTON_CLASSES.primary}>
        {pending ? "جارٍ الحفظ..." : "أكملت الدرس"}
      </button>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
