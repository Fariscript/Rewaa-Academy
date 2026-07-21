import { describe, expect, it } from "vitest";
import { formatCountdown, remainingSeconds } from "./countdown";

describe("remainingSeconds", () => {
  const base = new Date("2026-07-20T10:00:00.000Z");

  it("counts whole seconds up, rounding partial seconds toward the trainee", () => {
    expect(remainingSeconds(new Date(base.getTime() + 600_000), base)).toBe(600);
    expect(remainingSeconds(new Date(base.getTime() + 1500), base)).toBe(2);
    expect(remainingSeconds(new Date(base.getTime() + 1), base)).toBe(1);
  });

  it("floors at zero once the deadline passes", () => {
    expect(remainingSeconds(base, base)).toBe(0);
    expect(remainingSeconds(new Date(base.getTime() - 5000), base)).toBe(0);
  });
});

describe("formatCountdown", () => {
  it("renders MM:SS under an hour", () => {
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(9)).toBe("00:09");
    expect(formatCountdown(65)).toBe("01:05");
    expect(formatCountdown(600)).toBe("10:00");
    expect(formatCountdown(3599)).toBe("59:59");
  });

  it("renders H:MM:SS from an hour up", () => {
    expect(formatCountdown(3600)).toBe("1:00:00");
    expect(formatCountdown(3661)).toBe("1:01:01");
  });

  it("clamps negatives to zero", () => {
    expect(formatCountdown(-30)).toBe("00:00");
  });
});
