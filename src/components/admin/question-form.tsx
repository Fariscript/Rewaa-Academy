"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BUTTON_CLASSES } from "@/components/ui/button";

const TYPE_OPTIONS = [
  { value: "MCQ", label: "اختيار من متعدد" },
  { value: "TRUE_FALSE", label: "صح أو خطأ" },
  { value: "SCENARIO", label: "سيناريو بيعي" },
  { value: "FREE_TEXT", label: "إجابة حرة" },
  { value: "MOCK_CALL", label: "مكالمة تجريبية" },
] as const;

type QuestionTypeValue = (typeof TYPE_OPTIONS)[number]["value"];

const OPTION_IDS = ["a", "b", "c", "d", "e", "f"];
const TRUE_FALSE_OPTIONS = [
  { id: "true", text: "صحيح" },
  { id: "false", text: "خطأ" },
];

export interface QuestionFormInitial {
  type: QuestionTypeValue;
  prompt: string;
  options: { id: string; text: string }[] | null;
  correctOption: string | null;
}

// Shared create/edit form. Server-side validation in
// validateQuestionContent stays the authority — this form only makes the
// happy path convenient. Editing an APPROVED question resets it to DRAFT
// server-side (the hard gate); the page shows that warning.
export function QuestionForm({
  submitUrl,
  method,
  returnTo,
  initial,
}: {
  submitUrl: string;
  method: "POST" | "PATCH";
  returnTo: string;
  initial?: QuestionFormInitial;
}) {
  const router = useRouter();
  const [type, setType] = useState<QuestionTypeValue>(initial?.type ?? "MCQ");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [optionTexts, setOptionTexts] = useState<string[]>(
    initial?.type === "MCQ" && initial.options ? initial.options.map((o) => o.text) : ["", ""],
  );
  const [correct, setCorrect] = useState<string>(initial?.correctOption ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMcq = type === "MCQ";
  const isTrueFalse = type === "TRUE_FALSE";
  const autoGraded = isMcq || isTrueFalse;

  function buildPayload() {
    if (isMcq) {
      const options = optionTexts
        .map((text, index) => ({ id: OPTION_IDS[index], text: text.trim() }))
        .filter((o) => o.text.length > 0);
      return { type, prompt: prompt.trim(), options, correctOption: correct };
    }
    if (isTrueFalse) {
      return { type, prompt: prompt.trim(), options: TRUE_FALSE_OPTIONS, correctOption: correct };
    }
    return { type, prompt: prompt.trim() };
  }

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(submitUrl, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error ?? "تعذّر حفظ السؤال.");
        return;
      }
      router.push(returnTo);
      router.refresh();
    } catch {
      setError("تعذّر حفظ السؤال.");
    } finally {
      setPending(false);
    }
  }

  const canSubmit =
    prompt.trim().length > 0 &&
    (!autoGraded || (correct.length > 0 && (!isMcq || optionTexts.filter((t) => t.trim()).length >= 2)));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="q-type">
          نوع السؤال
        </label>
        <select
          id="q-type"
          value={type}
          onChange={(event) => {
            setType(event.target.value as QuestionTypeValue);
            setCorrect("");
          }}
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="q-prompt">
          نص السؤال
        </label>
        <textarea
          id="q-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={3}
          className="w-full rounded-md border border-neutral-300 p-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>

      {isMcq ? (
        <fieldset>
          <legend className="mb-1 text-sm font-medium">الخيارات (حدد الإجابة الصحيحة)</legend>
          <div className="flex flex-col gap-2">
            {optionTexts.map((text, index) => (
              <div key={OPTION_IDS[index]} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mcq-correct"
                  checked={correct === OPTION_IDS[index]}
                  onChange={() => setCorrect(OPTION_IDS[index])}
                  disabled={!text.trim()}
                  aria-label={`الخيار ${OPTION_IDS[index]} هو الصحيح`}
                />
                <input
                  type="text"
                  value={text}
                  onChange={(event) =>
                    setOptionTexts((current) => current.map((t, i) => (i === index ? event.target.value : t)))
                  }
                  placeholder={`الخيار ${index + 1}`}
                  className="flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                />
                {optionTexts.length > 2 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setOptionTexts((current) => current.filter((_, i) => i !== index));
                      if (correct === OPTION_IDS[index]) setCorrect("");
                    }}
                    className={BUTTON_CLASSES.subtle}
                    aria-label="حذف الخيار"
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            ))}
            {optionTexts.length < OPTION_IDS.length ? (
              <button
                type="button"
                onClick={() => setOptionTexts((current) => [...current, ""])}
                className={`${BUTTON_CLASSES.subtle} self-start`}
              >
                + إضافة خيار
              </button>
            ) : null}
          </div>
        </fieldset>
      ) : null}

      {isTrueFalse ? (
        <fieldset>
          <legend className="mb-1 text-sm font-medium">الإجابة الصحيحة</legend>
          <div className="flex items-center gap-4">
            {TRUE_FALSE_OPTIONS.map((option) => (
              <label key={option.id} className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  name="tf-correct"
                  checked={correct === option.id}
                  onChange={() => setCorrect(option.id)}
                />
                <span>{option.text}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {!autoGraded ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          هذا النوع يُصحّح يدوياً — لا خيارات ولا إجابة نموذجية.
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button type="button" onClick={submit} disabled={pending || !canSubmit} className={BUTTON_CLASSES.primary}>
          {pending ? "جارٍ الحفظ..." : "حفظ السؤال"}
        </button>
        {error ? <span className="text-sm text-red-600 dark:text-red-400">{error}</span> : null}
      </div>
    </div>
  );
}
