"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
const RETRY_DELAY_MS = 5000;

export function QuizRunner({ attempt }: { attempt: RunnerAttempt }) {
  const router = useRouter();

  // T-32: the countdown is display-only and follows the SERVER clock. The
  // initial value is pure (props only); the client↔server skew is measured
  // inside the tick effect, where impure reads are allowed. Actual expiry
  // is enforced server-side (syncExpiry) — when the display hits zero we
  // just submit, and the server idempotently auto-submits whatever was
  // saved even if this tab never does.
  const [remaining, setRemaining] = useState(() =>
    remainingSeconds(new Date(attempt.expiresAt), new Date(attempt.serverNow)),
  );
  const [answers, setAnswers] = useState<RunnerAnswer[]>(attempt.answers);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const answersRef = useRef(attempt.answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const dirtyRef = useRef(false);
  const submittedRef = useRef(false);
  const submitBusyRef = useRef(false);
  // The attempt was finalized server-side mid-edit (PATCH answered 403,
  // e.g. the timer ran out in another tab) — nothing more can be saved.
  const attemptClosedRef = useRef(false);
  // All persists run through one promise chain so PATCHes never overlap —
  // an older in-flight payload can't land after (and clobber) a newer one.
  const persistChainRef = useRef<Promise<void>>(Promise.resolve());
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Lets the failure-retry timeout call back into persist without the
  // callback referencing itself.
  const retryPersistRef = useRef<() => void>(() => {});

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const persist = useCallback(
    (opts?: { force?: boolean }): Promise<void> => {
      const run = async () => {
        if (!dirtyRef.current || attemptClosedRef.current) return;
        if (submittedRef.current && !opts?.force) return;
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
          if (response.status === 403) {
            // Attempt already finalized server-side; stop saving, let
            // submit/redirect take over (POST submit is idempotent).
            attemptClosedRef.current = true;
            setSaveState("idle");
            return;
          }
          if (!response.ok) throw new Error();
          setSaveState("saved");
        } catch {
          dirtyRef.current = true;
          setSaveState("error");
          // The UI promises an automatic retry — actually schedule one.
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => {
            if (dirtyRef.current && !submittedRef.current) retryPersistRef.current();
          }, RETRY_DELAY_MS);
        }
      };
      persistChainRef.current = persistChainRef.current.then(run);
      return persistChainRef.current;
    },
    [attempt.id],
  );

  useEffect(() => {
    retryPersistRef.current = () => void persist();
  }, [persist]);

  const submit = useCallback(async () => {
    if (submitBusyRef.current || submittedRef.current) return;
    submitBusyRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Flush unsaved answers BEFORE finalizing — submitting must never
      // silently drop a change made inside the autosave debounce window.
      await persist({ force: true });
      if (dirtyRef.current && !attemptClosedRef.current) throw new Error("unsaved answers");
      const response = await fetch(`/api/attempts/${attempt.id}/submit`, { method: "POST" });
      if (!response.ok) throw new Error();
      submittedRef.current = true;
      router.push(`/quizzes/${attempt.quizId}/result`);
    } catch {
      submitBusyRef.current = false;
      setSubmitting(false);
      setSubmitError("تعذّر تسليم الاختبار، تحقق من اتصالك ثم حاول مرة أخرى.");
    }
  }, [attempt.id, attempt.quizId, persist, router]);

  // 1s display tick; measures clock skew here (impure reads belong in
  // effects, not render); auto-submits at zero.
  useEffect(() => {
    const expiresAt = new Date(attempt.expiresAt);
    const skewMs = new Date(attempt.serverNow).getTime() - Date.now();
    const tick = () => {
      const left = remainingSeconds(expiresAt, new Date(Date.now() + skewMs));
      setRemaining(left);
      if (left <= 0) void submit();
    };
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [attempt.expiresAt, attempt.serverNow, submit]);

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
          {/* role="timer" keeps default aria-live="off" — announcing every
              second would swamp a screen reader. */}
          <div
            className={`rounded-md px-3 py-1.5 font-mono text-lg font-bold tabular-nums ${
              remaining <= 60
                ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200"
                : "bg-neutral-100 dark:bg-neutral-800"
            }`}
            dir="ltr"
            role="timer"
          >
            {formatCountdown(remaining)}
          </div>
        </div>
      </div>

      <ol className="flex flex-col gap-4">
        {answers.map((answer, index) => (
          <li key={answer.questionId ?? index}>
            <Card>
              {AUTO_GRADED.has(answer.questionType) && answer.options ? (
                <fieldset>
                  <legend className="mb-3 font-medium">
                    <span className="text-neutral-400 dark:text-neutral-500" dir="ltr">
                      {index + 1}.
                    </span>{" "}
                    {answer.questionPrompt}
                  </legend>
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
                </fieldset>
              ) : (
                <>
                  <p className="mb-3 font-medium" id={`prompt-${answer.questionId ?? index}`}>
                    <span className="text-neutral-400 dark:text-neutral-500" dir="ltr">
                      {index + 1}.
                    </span>{" "}
                    {answer.questionPrompt}
                  </p>
                  <textarea
                    value={answer.textAnswer ?? ""}
                    onChange={(event) => updateAnswer(index, { textAnswer: event.target.value })}
                    disabled={submitting}
                    rows={4}
                    placeholder="اكتب إجابتك هنا..."
                    aria-labelledby={`prompt-${answer.questionId ?? index}`}
                    className="w-full rounded-md border border-neutral-300 p-3 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-100"
                  />
                </>
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
