/**
 * Exact money utilities.
 *
 * Monetary values are always integer poisha (1 taka = 100 poisha) kept in
 * bigint. JavaScript numbers are never used for money: they cannot represent
 * every decimal exactly and can silently lose precision.
 */

export const POISHA_PER_TAKA = 100n;

/** Unsigned decimal amount with at most 2 decimal places: "100", "100.5", "100.50". */
const DECIMAL_AMOUNT_PATTERN = /^\d+(?:\.\d{1,2})?$/;

/**
 * Converts a user-entered amount to integer poisha.
 *
 * Examples:
 *   "100"     -> 10000n
 *   "100.50"  -> 10050n
 *   "0.01"    -> 1n
 *
 * Parsing is string-based on purpose. `Number("100.50") * 100` can produce
 * values such as 10049.999999999998, which would be wrong for money.
 *
 * The amount may have surrounding whitespace. Signs, commas, scientific
 * notation and more than 2 decimal places are rejected.
 *
 * Zero is a valid conversion result. Callers that require a positive amount
 * (for example, an expense) must check that separately.
 */
export function parseMoneyToPoisha(input: string): bigint {
  if (typeof input !== "string") {
    throw new TypeError("Money amount must be a string");
  }

  const trimmed = input.trim();

  if (trimmed === "") {
    throw new RangeError("Money amount is required");
  }

  if (trimmed.startsWith("-")) {
    throw new RangeError("Money amount cannot be negative");
  }

  return parseUnsignedDecimal(trimmed, input);
}

/**
 * Parses a signed decimal amount produced by poishaToDecimalString().
 *
 * Balance and settlement-effect DTOs can be negative, so display code must not
 * use the positive-only parser above. User-entered amounts should continue to
 * use parseMoneyToPoisha() so negative input is rejected.
 */
export function parseSignedMoneyToPoisha(input: string): bigint {
  if (typeof input !== "string") {
    throw new TypeError("Money amount must be a string");
  }

  const trimmed = input.trim();

  if (trimmed === "") {
    throw new RangeError("Money amount is required");
  }

  if (trimmed.startsWith("-")) {
    const magnitude = trimmed.slice(1);
    if (magnitude === "") {
      throw new RangeError(`Invalid money amount: "${input}"`);
    }

    return -parseUnsignedDecimal(magnitude, input);
  }

  return parseUnsignedDecimal(trimmed, input);
}

function parseUnsignedDecimal(trimmed: string, original: string): bigint {
  if (/^\d+\.\d{3,}$/.test(trimmed)) {
    throw new RangeError("Money amount cannot have more than 2 decimal places");
  }

  if (!DECIMAL_AMOUNT_PATTERN.test(trimmed)) {
    throw new RangeError(`Invalid money amount: "${original}"`);
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const fractionInPoisha = fraction.padEnd(2, "0");

  return BigInt(whole) * POISHA_PER_TAKA + BigInt(fractionInPoisha);
}

/**
 * Formats integer poisha for display in Bangladeshi Taka, using lakh/crore
 * digit grouping: 125075n -> "৳1,250.75", 10000000n -> "৳1,00,000.00".
 *
 * A negative value is formatted as "-৳1,00,000.00" so balances can be shown
 * later without a separate formatter.
 */
export function formatPoisha(amount: bigint): string {
  if (typeof amount !== "bigint") {
    throw new TypeError("Money amount must be a bigint");
  }

  const isNegative = amount < 0n;
  const absolute = isNegative ? -amount : amount;
  const taka = absolute / POISHA_PER_TAKA;
  const poisha = absolute % POISHA_PER_TAKA;

  const fraction = poisha.toString().padStart(2, "0");
  const formatted = `${groupSouthAsianDigits(taka.toString())}.${fraction}`;

  return `${isNegative ? "-" : ""}৳${formatted}`;
}

/**
 * Converts poisha to a plain decimal taka string without a symbol or grouping.
 * This is the safe wire format for BigInt amounts: "120000" poisha becomes
 * "1200.00", which can be sent through JSON and parsed again exactly.
 */
export function poishaToDecimalString(amount: bigint): string {
  if (typeof amount !== "bigint") {
    throw new TypeError("Money amount must be a bigint");
  }

  const isNegative = amount < 0n;
  const absolute = isNegative ? -amount : amount;
  const taka = absolute / POISHA_PER_TAKA;
  const poisha = absolute % POISHA_PER_TAKA;

  return `${isNegative ? "-" : ""}${taka}.${poisha.toString().padStart(2, "0")}`;
}

/**
 * Sums poisha exactly. Useful for checks such as "do split amounts equal the
 * expense total?".
 */
export function sumPoisha(amounts: readonly bigint[]): bigint {
  return amounts.reduce((total, amount) => {
    if (typeof amount !== "bigint") {
      throw new TypeError("Money amount must be a bigint");
    }
    return total + amount;
  }, 0n);
}

/**
 * Groups digits the South Asian way: the last three digits first, then
 * groups of two. 1234567 -> "12,34,567".
 *
 * Done with strings so formatting never goes through a Number.
 */
function groupSouthAsianDigits(digits: string): string {
  if (digits.length <= 3) {
    return digits;
  }

  const lastThree = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const groups: string[] = [];

  while (rest.length > 2) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }

  if (rest !== "") {
    groups.unshift(rest);
  }

  return `${groups.join(",")},${lastThree}`;
}
