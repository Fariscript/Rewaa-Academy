import type { QuestionType } from "@/generated/prisma/client";

// T-17: auto-graded via exact-match scoring. T-18: everything else is
// routed to manual grading — see src/lib/grading/.
export const AUTO_GRADED_TYPES: QuestionType[] = ["MCQ", "TRUE_FALSE"];
export const MANUALLY_GRADED_TYPES: QuestionType[] = ["SCENARIO", "FREE_TEXT", "MOCK_CALL"];

export function isAutoGraded(type: QuestionType): boolean {
  return AUTO_GRADED_TYPES.includes(type);
}
