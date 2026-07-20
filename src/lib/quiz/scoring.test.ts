import { describe, expect, it } from "vitest";
import { isPassing, scoreAnswers } from "./scoring";

describe("isPassing", () => {
  it("passes at exactly 95%", () => {
    expect(isPassing(19, 20)).toBe(true);
  });

  it("fails just under 95%", () => {
    expect(isPassing(18, 20)).toBe(false);
  });

  it("has no false positive when 95% is mathematically unreachable (open item #7)", () => {
    // 10 questions: 90% (9/10) or 100% (10/10) are the only options near 95%.
    expect(isPassing(9, 10)).toBe(false);
    expect(isPassing(10, 10)).toBe(true);
  });

  it("treats zero questions as not passing", () => {
    expect(isPassing(0, 0)).toBe(false);
  });
});

describe("scoreAnswers", () => {
  it("scores all-correct as 100% passed", () => {
    const result = scoreAnswers([
      { selectedOption: "a", correctOption: "a" },
      { selectedOption: "b", correctOption: "b" },
    ]);
    expect(result).toEqual({ correctCount: 2, totalCount: 2, score: 100, passed: true });
  });

  it("scores all-wrong as 0% failed", () => {
    const result = scoreAnswers([
      { selectedOption: "x", correctOption: "a" },
      { selectedOption: null, correctOption: "b" },
    ]);
    expect(result).toEqual({ correctCount: 0, totalCount: 2, score: 0, passed: false });
  });

  it("treats an unanswered question as incorrect, not a crash", () => {
    const result = scoreAnswers([
      { selectedOption: null, correctOption: "a" },
      { selectedOption: "b", correctOption: "b" },
    ]);
    expect(result.correctCount).toBe(1);
    expect(result.score).toBe(50);
    expect(result.passed).toBe(false);
  });
});
