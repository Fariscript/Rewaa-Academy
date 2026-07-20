import type { QuestionType } from "@/generated/prisma/client";

const SUPPORTED_TYPES: QuestionType[] = ["MCQ", "TRUE_FALSE"];

export interface QuestionContentInput {
  type: unknown;
  prompt: unknown;
  options: unknown;
  correctOption: unknown;
}

export interface ValidQuestionContent {
  type: QuestionType;
  prompt: string;
  options: { id: string; text: string }[];
  correctOption: string;
}

export type ValidationResult =
  | { ok: true; value: ValidQuestionContent }
  | { ok: false; reason: string };

// Shared by AI-drafted (draft.ts) and manually-authored (manage.ts) content
// — same rules either way, validated before persisting, not after
// (CLAUDE.md "Slice 5 decisions"). Trusting a human typist not to submit
// malformed JSON isn't a reason to skip server-side validation (NFR-02
// spirit: validate at the boundary regardless of who's on the other end).
export function validateQuestionContent(input: QuestionContentInput): ValidationResult {
  const { type, prompt, options, correctOption } = input;

  if (typeof type !== "string" || !SUPPORTED_TYPES.includes(type as QuestionType)) {
    return { ok: false, reason: `unsupported question type: ${String(type)}` };
  }
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    return { ok: false, reason: "empty or missing prompt" };
  }
  if (!Array.isArray(options) || options.length === 0) {
    return { ok: false, reason: "empty or missing options" };
  }
  for (const option of options) {
    if (
      typeof option !== "object" ||
      option === null ||
      typeof (option as Record<string, unknown>).id !== "string" ||
      ((option as Record<string, unknown>).id as string).trim().length === 0 ||
      typeof (option as Record<string, unknown>).text !== "string" ||
      ((option as Record<string, unknown>).text as string).trim().length === 0
    ) {
      return { ok: false, reason: "an option is missing a non-empty id or text" };
    }
  }
  if (typeof correctOption !== "string" || correctOption.trim().length === 0) {
    return { ok: false, reason: "empty or missing correctOption" };
  }
  const optionIds = (options as { id: string; text: string }[]).map((o) => o.id);
  if (!optionIds.includes(correctOption)) {
    return { ok: false, reason: "correctOption does not match any option id" };
  }

  return {
    ok: true,
    value: {
      type: type as QuestionType,
      prompt: prompt.trim(),
      options: options as { id: string; text: string }[],
      correctOption,
    },
  };
}
