export type AppErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VALIDATION"
  | "CONFLICT";

/** Errors we expect and are safe to show to the user. */
export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super("NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do this") {
    super("FORBIDDEN", message);
    this.name = "ForbiddenError";
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid input") {
    super("VALIDATION", message);
    this.name = "ValidationError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "This action conflicts with the current state") {
    super("CONFLICT", message);
    this.name = "ConflictError";
  }
}
