/**
 * Activity metadata is JSON stored in PostgreSQL. These helpers convert
 * application values (including Date and bigint) into JSON-safe data and strip
 * anything that looks like a credential as defense in depth.
 *
 * Writes already use explicit, safe snapshots. This is a second barrier so a
 * future caller cannot accidentally persist a token or password in history.
 */

const SENSITIVE_KEY_PATTERN =
  /(?:password|passwd|secret|token|otp|pin|credential|authorization|cookie|session|app[_-]?key|app[_-]?secret|access[_-]?token|refresh[_-]?token|id[_-]?token)/i;

const MAX_DEPTH = 6;
const MAX_ARRAY_LENGTH = 100;
const MAX_STRING_LENGTH = 2_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return null;

  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    // JSON cannot represent NaN/Infinity; store null instead of invalid JSON.
    return typeof value === "number" && !Number.isFinite(value) ? null : value;
  }

  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH
      ? value.slice(0, MAX_STRING_LENGTH)
      : value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((entry) => sanitizeValue(entry, depth + 1));
  }

  if (isRecord(value)) {
    const result: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        continue;
      }

      result[key] = sanitizeValue(entry, depth + 1);
    }

    return result;
  }

  // Functions, symbols, undefined, etc. have no safe JSON representation.
  return null;
}

/**
 * Returns a sanitized metadata object, or null when the value is not an object.
 * Root arrays are rejected because every activity's metadata is a record.
 */
export function sanitizeActivityMetadata(
  metadata: unknown,
): Record<string, unknown> | null {
  const sanitized = sanitizeValue(metadata, 0);
  return isRecord(sanitized) ? sanitized : null;
}
