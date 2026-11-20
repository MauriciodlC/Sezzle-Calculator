import { describe, expect, it } from "vitest";
import { formatNumber } from "./format";

describe("formatNumber", () => {
  it("renders ordinary values without trailing zeros", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(-0)).toBe("0");
    expect(formatNumber(12)).toBe("12");
    expect(formatNumber(1.5)).toBe("1.5");
    expect(formatNumber(0.1 + 0.2)).toBe("0.3");
  });

  it("uses scientific notation for extreme magnitudes", () => {
    expect(formatNumber(1e13)).toMatch(/e\+13$/);
    expect(formatNumber(1e-10)).toMatch(/e-10$/);
  });

  it("does not present a non-finite value as a number", () => {
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe("Error");
  });
});
