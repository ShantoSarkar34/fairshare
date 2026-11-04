import { z } from "zod";

import { idSchema } from "@/lib/validations/common";

export const ACTIVITY_DEFAULT_PAGE_SIZE = 20;
export const ACTIVITY_MAX_PAGE_SIZE = 50;
const CURSOR_MAX_LENGTH = 512;

const cursorSchema = z
  .string()
  .trim()
  .min(1, "Invalid activity cursor")
  .max(CURSOR_MAX_LENGTH, "Invalid activity cursor");

/** Validates pagination options accepted by the activity retrieval service. */
export const activityPageQuerySchema = z.object({
  cursor: cursorSchema.optional(),
  // A caller may request a smaller page, but never an unbounded history.
  limit: z
    .number()
    .int()
    .min(1)
    .max(ACTIVITY_MAX_PAGE_SIZE)
    .optional(),
});

export type ActivityPageQueryInput = z.infer<typeof activityPageQuerySchema>;

/** Validates the untrusted arguments of the "Load more" server action. */
export const activityPageActionSchema = z.object({
  groupId: idSchema,
  cursor: cursorSchema.optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(ACTIVITY_MAX_PAGE_SIZE)
    .default(ACTIVITY_DEFAULT_PAGE_SIZE),
});

/** Shape encoded into the opaque cursor sent to the browser. */
export const activityCursorPayloadSchema = z.object({
  createdAt: z.string().min(1),
  id: z.string().min(1).max(100),
});

export type ActivityCursorPayload = z.infer<typeof activityCursorPayloadSchema>;
