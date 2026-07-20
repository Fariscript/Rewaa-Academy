import { describe, expect, it } from "vitest";
import { validateQuestionContent } from "./validate-content";

describe("validateQuestionContent", () => {
  it("accepts a well-formed MCQ", () => {
    const result = validateQuestionContent({
      type: "MCQ",
      prompt: "سؤال",
      options: [
        { id: "a", text: "أ" },
        { id: "b", text: "ب" },
      ],
      correctOption: "a",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an MCQ with a correctOption that doesn't match any option id", () => {
    const result = validateQuestionContent({
      type: "MCQ",
      prompt: "سؤال",
      options: [{ id: "a", text: "أ" }],
      correctOption: "z",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an unsupported type", () => {
    const result = validateQuestionContent({ type: "ESSAY", prompt: "سؤال", options: [], correctOption: "" });
    expect(result.ok).toBe(false);
  });

  it("rejects an empty prompt regardless of type", () => {
    expect(validateQuestionContent({ type: "MCQ", prompt: "  ", options: [], correctOption: "" }).ok).toBe(false);
    expect(validateQuestionContent({ type: "FREE_TEXT", prompt: "" }).ok).toBe(false);
  });

  it.each(["SCENARIO", "FREE_TEXT", "MOCK_CALL"] as const)(
    "accepts a %s with only a prompt — no options/correctOption required",
    (type) => {
      const result = validateQuestionContent({ type, prompt: "سؤال مفتوح" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.options).toBeNull();
        expect(result.value.correctOption).toBeNull();
      }
    },
  );

  it("ignores options/correctOption if provided for a manually-graded type", () => {
    const result = validateQuestionContent({
      type: "FREE_TEXT",
      prompt: "سؤال",
      options: [{ id: "a", text: "أ" }],
      correctOption: "a",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.options).toBeNull();
      expect(result.value.correctOption).toBeNull();
    }
  });
});
