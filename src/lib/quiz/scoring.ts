// T-2: 95% passing grade, checked as an exact fraction — never floating-point
// rounding. Note (CLAUDE.md open item #7): with an integer question count,
// 95% is only reachable when it lands on a whole number of correct answers
// (e.g. 20 questions -> 19/20 = 95%); this function does not compensate for
// unreachable thresholds, it just scores exactly what was answered.
export function isPassing(correctCount: number, totalCount: number): boolean {
  if (totalCount === 0) return false;
  return correctCount * 100 >= totalCount * 95;
}

export interface ScorableAnswer {
  selectedOption: string | null;
  // Nullable because AttemptAnswer.correctOption is null for
  // manually-graded question types — the equality check below already
  // treats that as never-matching, so this is just a type widening to
  // match reality, not a behavior change for auto-graded answers.
  correctOption: string | null;
}

export interface ScoreResult {
  correctCount: number;
  totalCount: number;
  score: number;
  passed: boolean;
}

export function scoreAnswers(answers: ScorableAnswer[]): ScoreResult {
  const totalCount = answers.length;
  const correctCount = answers.filter((a) => a.selectedOption !== null && a.selectedOption === a.correctOption).length;
  const score = totalCount === 0 ? 0 : (correctCount / totalCount) * 100;
  return { correctCount, totalCount, score, passed: isPassing(correctCount, totalCount) };
}
