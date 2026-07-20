"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCountdown, remainingSeconds } from "@/lib/quiz/countdown";
import { BUTTON_CLASSES } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// JSON-safe projection of TraineeAttemptView (dates as ISO strings) — the
// server page builds this; it never includes correctOption.
export interface RunnerAnswer {
  questionId: string | null;
  questionPrompt: string;
  questionType: "MCQ" | "TRUE_FALSE" | "SCENARIO" | "FREE_TEXT" | "MOCK_CALL";
  options: { id: string; text: string }[] | null;
  selectedOption: string | null;
  textAnswer: string | null;
}

export interface RunnerAttempt {
  id: string;
  quizId: string;
  quizTitle: string;
  attemptNumber: number;
  expiresAt: string;
  serverNow: string;
  answers: RunnerAnswer[];
}

type SaveState = "idle" | "saving" | "saved" | "error";

const AUTO_GRADED = new Set(["MCQ", "TRUE_FALSE"]);

export function QuizRunner({ attempt }: { attempt: RunnerAttempt }) {
  const router = useRouter();

  // T-32: the countdown is display-only and follows the SERVER clock — at
  // mount we compute the client↔server skew from serverNow and render
  // expiresAt through it. Actual expiry is enforced server-side
  // (syncExpiry); when the display hits zero we just submit, and the server
  // idempotently auto-submits whatever was saved even if this tab never
  // does.
  const clockSkewMs = useMemo(() => new Date(attempt.serverNow).getTime() - Date.now(), [attempt.serverNow]);
  const expiresAt = useMemo(() => new Date(attempt.expiresAt), [attempt.expiresAt]);
  const serverNow = useCallback(() => new Date(Date.now() + clockSkewMs), [clockSkewMs]);

  const [remaining, setRemaining] = useState(() => remainingSeconds(expiresAt, serverNow()));
  const [answers, setAnswers] = useState<RunnerAnswer[]>(attempt.answers);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const answersRef = useRef(answers);
  answersRef.current = answers;
  const dirtyRef = useRef(false);
  const submittedRef = useRef(false);

  const persist = useCallback(async () => {
    if (!dirtyRef.current || submittedRef.current) return;
    dirtyRef.current = false;
    setSaveState("saving");
    try {
      const payload = answersRef.current
        .filter((a) => a.questionId !== null)
        .map((a) =>
          AUTO_GRADED.has(a.questionType)
            ? { questionId: a.questionId, selectedOption: a.selectedOption }
            : { questionId: a.questionId, textAnswer: a.textAnswer },
        );
      const response = await fetch(`/api/attempts/${attempt.id}/answers`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: payload }),
      });
      if (!response.ok) throw new Error();
      setSaveState("saved");
    } catch {
      dirtyRef.current = true; // retry on the next change/tick of activity
      setSaveState("error");
    }
  }, [attempt.id]);

  const submit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await persist();
      const response = await fetch(`/api/attempts/${attempt.id}/submit`, { method: "POST" });
      if (!response.ok) throw new Error();
      router.push(`/quizzes/${attempt.quizId}/result`);
    } catch {
      submittedRef.current = false;
      setSubmitting(false);
      setSubmitError("تعذّر تسليم الاختبار، تحقق من اتصالك ثم حاول مرة أخرى.");
    }
  }, [attempt.id, attempt.quizId, persist, router]);

  // 1s display tick; auto-submit at zero.
  useEffect(() => {
    const tick = () => {
      const left = remainingSeconds(expiresAt, serverNow());
      setRemaining(left);
      if (left <= 0) void submit();
    };
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, serverNow, submit]);

  // Debounced autosave whenever answers change.
  useEffect(() => {
    if (!dirtyRef.current) return;
    const timeout = setTimeout(() => void persist(), 800);
    return () => clearTimeout(timeout);
  }, [answers, persist]);

  function updateAnswer(index: number, patch: Partial<RunnerAnswer>) {
    dirtyRef.current = true;
    setSaveState("idle");
    setAnswers((current) => current.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }

  const answeredCount = answers.filter((a) =>
    AUTO_GRADED.has(a.questionType) ? a.selectedOption !== null : Boolean(a.textAnswer?.trim()),
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-4 border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-bold">{attempt.quizTitle}</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              المحاولة <span dir="ltr">{attempt.attemptNumber}</span> · أجبت عن{" "}
              <span dir="ltr">
                {answeredCount}/{answers.length}
              </span>
            </p>
          </div>
          <div
            className={`rounded-md px-3 py-1.5 font-mono text-lg font-bold tabular-nums ${
              remaining <= 60
                ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200"
                : "bg-neutral-100 dark:bg-neutral-800"
            }`}
            dir="ltr"
            role="timer"
            aria-live="polite"
          >
            {formatCountdown(remaining)}
          </div>
        </div>
      </div>

      <ol className="flex flex-col gap-4">
        {answers.map((answer, index) => (
          <li key={answer.questionId ?? index}>
            <Card>
              <p className="mb-3 font-medium">
                <span className="text-neutral-400 dark:text-neutral-500" dir="ltr">
                  {index + 1}.
                </span>{" "}
                {answer.questionPrompt}
              </p>
              {AUTO_GRADED.has(answer.questionType) && answer.options ? (
                <div className="flex flex-col gap-2">
                  {answer.options.map((option) => (
                    <label
                      key={option.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md border border-neutral-200 px-3 py-2 has-checked:border-neutral-900 has-checked:bg-neutral-50 dark:border-neutral-800 dark:has-checked:border-neutral-100 dark:has-checked:bg-neutral-900"
                    >
                      <input
                        type="radio"
                        name={`q-${answer.questionId ?? index}`}
                        checked={answer.selectedOption === option.id}
                        onChange={() => updateAnswer(index, { selectedOption: option.id })}
                        disabled={submitting}
                      />
                      <span>{option.text}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <textarea
                  value={answer.textAnswer ?? ""}
                  onChange={(event) => updateAnswer(index, { textAnswer: event.target.value })}
                  disabled={submitting}
                  rows={4}
                  placeholder="اكتب إجابتك هنا..."
                  className="w-full rounded-md border border-neutral-300 p-3 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-100"
                />
              )}
            </Card>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-3 pb-8">
        <button type="button" onClick={() => void submit()} disabled={submitting} className={BUTTON_CLASSES.primary}>
          {submitting ? "جارٍ التسليم..." : "تسليم الاختبار"}
        </button>
        <span className="text-sm text-neutral-500 dark:text-neutral-400" aria-live="polite">
          {saveState === "saving"
            ? "جارٍ حفظ الإجابات..."
            : saveState === "saved"
              ? "تم حفظ الإجابات"
              : saveState === "error"
                ? "تعذّر حفظ الإجابات — سيُعاد الحفظ تلقائياً"
                : null}
        </span>
        {submitError ? <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p> : null}
      </div>
    </div>
  );
}
