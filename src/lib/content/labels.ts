import type { QuestionSource, QuestionStatus, QuestionType, SkillType } from "@/generated/prisma/client";
import type { QuizOutcomeStatus } from "@/lib/quiz/outcome";

// NFR-09: Arabic-only UI with consistent terminology — every surface maps
// enum values through here rather than translating ad hoc.

export const SKILL_TYPE_LABELS: Record<SkillType, string> = {
  SOFT: "مهارات ناعمة",
  HARD: "مهارات تقنية",
};

// Deliberately neutral copy for FAILED_FINAL_ATTEMPT and
// AWAITING_MANUAL_GRADE: what happens after both attempts fail (open item
// #1) and how manual grades finalize (open item #4) are undecided — the UI
// must not promise a consequence or a pass bar.
export const QUIZ_STATUS_LABELS: Record<QuizOutcomeStatus, string> = {
  NOT_STARTED: "لم يبدأ",
  IN_PROGRESS: "قيد التنفيذ",
  AWAITING_MANUAL_GRADE: "بانتظار التصحيح",
  PASSED: "ناجح",
  FAILED_FINAL_ATTEMPT: "استُنفدت المحاولات",
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  MCQ: "اختيار من متعدد",
  TRUE_FALSE: "صح أو خطأ",
  SCENARIO: "سيناريو بيعي",
  FREE_TEXT: "إجابة حرة",
  MOCK_CALL: "مكالمة تجريبية",
};

export const QUESTION_STATUS_LABELS: Record<QuestionStatus, string> = {
  DRAFT: "مسودة",
  APPROVED: "معتمد",
  REJECTED: "مرفوض",
  RETIRED: "مسحوب",
};

export const QUESTION_SOURCE_LABELS: Record<QuestionSource, string> = {
  MANUAL: "إدخال يدوي",
  AI_DRAFT: "مسودة ذكاء اصطناعي",
};
