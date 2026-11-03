import { describe, expect, it } from "vitest";

import {
  formatBasisPointsAsPercent,
  parsePercentageToBasisPoints,
} from "./percentage";

describe("parsePercentageToBasisPoints", () => {
  const validCases: Array<[input: string, expected: number]> = [
    ["0", 0],
    ["0.01", 1],
    ["0.1", 10],
    ["1", 100],
    ["33.33", 3333],
    ["50", 5000],
    ["100", 10000],
    [" 25.5 ", 2550],
  ];

  it.each(validCases)("parses %s", (input, expected) => {
    expect(parsePercentageToBasisPoints(input)).toBe(expected);
  });

  const invalidCases = [
    "",
    "   ",
    "-1",
    "abc",
    "10.999",
    "100.01",
    "101",
    "NaN",
    "1e2",
    ".5",
    "50.",
    "1,000",
  ];

  it.each(invalidCases)("rejects %s", (input) => {
    expect(() => parsePercentageToBasisPoints(input)).toThrow(RangeError);
  });

  it("rejects a non-string runtime value", () => {
    expect(() =>
      parsePercentageToBasisPoints(50 as unknown as string),
    ).toThrow(TypeError);
  });
});

describe("formatBasisPointsAsPercent", () => {
  const cases: Array<[input: number, expected: string]> = [
    [0, "0"],
    [1, "0.01"],
    [10, "0.1"],
    [50, "0.5"],
    [100, "1"],
    [3333, "33.33"],
    [5000, "50"],
    [5001, "50.01"],
    [10000, "100"],
  ];

  it.each(cases)("formats %s as %s", (input, expected) => {
    expect(formatBasisPointsAsPercent(input)).toBe(expected);
  });

  it("rejects invalid basis points", () => {
    expect(() => formatBasisPointsAsPercent(-1)).toThrow(RangeError);
    expect(() => formatBasisPointsAsPercent(10001)).toThrow(RangeError);
    expect(() => formatBasisPointsAsPercent(1.5)).toThrow(RangeError);
  });
});
