"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BUTTON_CLASSES } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface DraftOutcome {
  createdCount: number;
  rejected: { reason: string }[];
}

// T-10: AI drafts candidates — every one lands as a DRAFT needing explicit
// approval (NFR-06 hard gate; no auto-publish path). Rejected candidates
// are surfaced here as well as being audit-logged server-side.
export function DraftQuestionsPanel({ quizId }: { quizId: string }) {
  const router = useRouter();
  const [count, setCount] = useState(5);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<DraftOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function draft() {
    setPending(true);
    setError(null);
    setOutcome(null);
    try {
      const response = await fetch(`/api/admin/quizzes/${quizId}/questions/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          response.status === 502
            ? "تعذّر الاتصال بمزوّد الذكاء الاصطناعي — تأكد من إعداد مفتاح ANTHROPIC_API_KEY."
            : "تعذّرت صياغة الأسئلة.",
        );
        return;
      }
      setOutcome({ createdCount: body.created.length, rejected: body.rejected });
      router.refresh();
    } catch {
      setError("تعذّرت صياغة الأسئلة.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-1 font-bold">صياغة أسئلة بالذكاء الاصطناعي</h2>
      <p className="mb-3 text-sm text-neutral-500 dark:text-neutral-400">
        تُنشأ الأسئلة كمسودات وتتطلب اعتمادك قبل وصولها لأي متدرب — لا نشر تلقائي.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm" htmlFor="draft-count">
          عدد الأسئلة:
        </label>
        <input
          id="draft-count"
          type="number"
          min={1}
          max={10}
          value={count}
          onChange={(event) => setCount(Math.max(1, Math.min(10, Number(event.target.value) || 1)))}
          className="w-20 rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          dir="ltr"
        />
        <button type="button" onClick={draft} disabled={pending} className={BUTTON_CLASSES.primary}>
          {pending ? "جارٍ الصياغة..." : "صياغة المسودات"}
        </button>
      </div>
      {outcome ? (
        <div className="mt-3 text-sm">
          <p>
            أُنشئت <span dir="ltr">{outcome.createdCount}</span> مسودة
            {outcome.rejected.length > 0 ? (
              <>
                {" "}
                واستُبعد <span dir="ltr">{outcome.rejected.length}</span> مقترحاً غير صالح:
              </>
            ) : null}
          </p>
          {outcome.rejected.length > 0 ? (
            <ul className="mt-1 list-inside list-disc text-neutral-500 dark:text-neutral-400">
              {outcome.rejected.map((r, i) => (
                <li key={i}>{r.reason}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </Card>
  );
}
