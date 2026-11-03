const ALLOWED_PATH = /^\/(dashboard|groups|settings|join)(\/[A-Za-z0-9_-]+)*$/;

export function safeRedirectPath(
  value: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!value || !ALLOWED_PATH.test(value)) {
    return fallback;
  }
  return value;
}
