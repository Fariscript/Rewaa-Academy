"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BUTTON_CLASSES } from "@/components/ui/button";

// Deliberately an isolated component: today's grade model is binary
// (صحيح/خطأ) per open item #4's current state. If the CEO's answer brings
// partial credit, this input and gradeAnswer are the only things that
// change — keep it that way.
export function GradeAnswerForm({ answerId }: { answerId: string }) {
  const router = useRouter();
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function grade() {
    if (isCorrect === null) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/grading/answers/${answerId}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCorrect, feedback }),
      });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      setError("تعذّر حفظ التقييم.");
      setPending(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
      <div className="flex items-center gap-4">
        <label className="flex cursor-pointer items-center gap-1.5">
          <input type="radio" name={`grade-${answerId}`} checked={isCorrect === true} onChange={() => setIsCorrect(true)} />
          <span>إجابة صحيحة</span>
        </label>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="radio"
            name={`grade-${answerId}`}
            checked={isCorrect === false}
            onChange={() => setIsCorrect(false)}
          />
          <span>إجابة خاطئة</span>
        </label>
      </div>
      <textarea
        value={feedback}
        onChange={(event) => setFeedback(event.target.value)}
        rows={2}
        placeholder="ملاحظات مكتوبة للمتدرب..."
        className="w-full rounded-md border border-neutral-300 p-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={grade}
          disabled={pending || isCorrect === null}
          className={BUTTON_CLASSES.primary}
        >
          {pending ? "جارٍ الحفظ..." : "اعتماد التقييم"}
        </button>
        {error ? <span className="text-sm text-red-600 dark:text-red-400">{error}</span> : null}
      </div>
    </div>
  );
}
