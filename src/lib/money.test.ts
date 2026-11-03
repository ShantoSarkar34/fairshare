import { describe, expect, it } from "vitest";

import {
  formatPoisha,
  parseMoneyToPoisha,
  sumPoisha,
} from "./money";

describe("parseMoneyToPoisha", () => {
  const validCases: Array<[input: string, expected: bigint]> = [
    ["100", 10000n],
    ["100.5", 10050n],
    ["100.50", 10050n],
    ["0.01", 1n],
    ["0.1", 10n],
    ["0", 0n],
    ["000.01", 1n],
    [" 1250.75 ", 125075n],
  ];

  it.each(validCases)("parses %s exactly", (input, expected) => {
    expect(parseMoneyToPoisha(input)).toBe(expected);
  });

  it("parses a large amount without losing precision", () => {
    expect(parseMoneyToPoisha("99999999999999999999.99")).toBe(
      9999999999999999999999n,
    );
  });

  const invalidCases: Array<[name: string, input: string]> = [
    ["negative", "-100"],
    ["negative with whitespace", " -0.01 "],
    ["non-numeric", "abc"],
    ["too many decimal places", "10.999"],
    ["empty", ""],
    ["whitespace only", "   "],
    ["NaN", "NaN"],
    ["Infinity", "Infinity"],
    ["scientific notation", "1e3"],
    ["leading plus sign", "+100"],
    ["comma separated", "1,000.75"],
    ["leading decimal point", ".5"],
    ["trailing decimal point", "100."],
    ["two decimal points", "1.2.3"],
    ["currency symbol", "৳100"],
  ];

  it.each(invalidCases)("rejects %s input", (_name, input) => {
    expect(() => parseMoneyToPoisha(input)).toThrow(RangeError);
  });

  it("rejects a non-string runtime value", () => {
    expect(() =>
      parseMoneyToPoisha(100 as unknown as string),
    ).toThrow(TypeError);
  });
});

describe("formatPoisha", () => {
  const formatCases: Array<[input: bigint, expected: string]> = [
    [0n, "৳0.00"],
    [1n, "৳0.01"],
    [99n, "৳0.99"],
    [100n, "৳1.00"],
    [10050n, "৳100.50"],
    [125075n, "৳1,250.75"],
    [10000000n, "৳1,00,000.00"],
    [1000000000000n, "৳10,00,00,00,000.00"],
    [123456789n, "৳12,34,567.89"],
    [-100000n, "-৳1,000.00"],
  ];

  it.each(formatCases)("formats %s as %s", (input, expected) => {
    expect(formatPoisha(input)).toBe(expected);
  });

  it("formats a large amount without using Number", () => {
    expect(formatPoisha(9999999999999999999999n)).toBe(
      "৳9,99,99,99,99,99,99,99,99,999.99",
    );
  });

  it("rejects a non-bigint runtime value", () => {
    expect(() => formatPoisha(100 as unknown as bigint)).toThrow(TypeError);
  });
});

describe("sumPoisha", () => {
  it("returns zero for an empty list", () => {
    expect(sumPoisha([])).toBe(0n);
  });

  it("sums amounts exactly", () => {
    expect(sumPoisha([10000n, 50050n, 1n])).toBe(60051n);
  });

  it("sums large amounts exactly", () => {
    expect(sumPoisha([9999999999999999999999n, 1n])).toBe(
      10000000000000000000000n,
    );
  });

  it("rejects a non-bigint runtime value", () => {
    expect(() => sumPoisha([100 as unknown as bigint])).toThrow(TypeError);
  });
});
