import { z } from "zod";
import { idSchema } from "@/lib/validations/common";

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

export const removeMemberSchema = z.object({
  groupId: idSchema,
  userId: idSchema,
});

export const deleteGroupSchema = z.object({
  groupId: idSchema,
  confirmName: z.string().trim().min(1).max(100),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
