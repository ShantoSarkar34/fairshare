/**
 * Exact conversion between user-entered percentages and integer basis points.
 *
 * 1% = 100 basis points, 100% = 10,000 basis points. Parsing is string-based so
 * values such as "33.33" never pass through floating-point arithmetic.
 */

const BASIS_POINTS_PER_PERCENT = 100n;
const MAX_BASIS_POINTS = 10_000n;
const PERCENTAGE_PATTERN = /^\d+(?:\.\d{1,2})?$/;

/** "50" -> 5000, "33.33" -> 3333, "0.01" -> 1. */
export function parsePercentageToBasisPoints(input: string): number {
  if (typeof input !== "string") {
    throw new TypeError("Percentage must be a string");
  }

  const trimmed = input.trim();

  if (trimmed === "") {
    throw new RangeError("Percentage is required");
  }

  if (trimmed.startsWith("-")) {
    throw new RangeError("Percentage cannot be negative");
  }

  if (/^\d+\.\d{3,}$/.test(trimmed)) {
    throw new RangeError("Percentage cannot have more than 2 decimal places");
  }

  if (!PERCENTAGE_PATTERN.test(trimmed)) {
    throw new RangeError(`Invalid percentage: "${input}"`);
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const basisPoints =
    BigInt(whole) * BASIS_POINTS_PER_PERCENT +
    BigInt(fraction.padEnd(2, "0"));

  if (basisPoints > MAX_BASIS_POINTS) {
    throw new RangeError("Percentage cannot exceed 100%");
  }

  return Number(basisPoints);
}

/** 5000 -> "50", 3333 -> "33.33", 50 -> "0.5", 1 -> "0.01". */
export function formatBasisPointsAsPercent(basisPoints: number): string {
  if (
    !Number.isSafeInteger(basisPoints) ||
    basisPoints < 0 ||
    basisPoints > Number(MAX_BASIS_POINTS)
  ) {
    throw new RangeError("Basis points must be an integer between 0 and 10000");
  }

  const whole = Math.trunc(basisPoints / 100);
  const fraction = basisPoints % 100;

  if (fraction === 0) {
    return String(whole);
  }

  return `${whole}.${String(fraction).padStart(2, "0").replace(/0$/, "")}`;
}
