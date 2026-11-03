import { z } from "zod";

export const createGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Group name must be at least 2 characters")
    .max(60, "Group name must be 60 characters or fewer"),
  description: z
    .string()
    .trim()
    .max(200, "Description must be 200 characters or fewer")
    .optional(),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
