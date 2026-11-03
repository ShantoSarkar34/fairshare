import { AppError } from "@/lib/errors";

export type FieldErrors = Record<string, string[] | undefined>;

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(
  error: string,
  fieldErrors?: FieldErrors,
): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/**
 * Converts a thrown error into a safe result. Expected errors (AppError)
 * show their message. Anything else is logged on the server and replaced with
 * a generic message so internals never reach the browser.
 */
export function toFailure(error: unknown): ActionResult<never> {
  if (error instanceof AppError) {
    return fail(error.message);
  }
  console.error("Unexpected action error:", error);
  return fail("Something went wrong. Please try again.");
}
