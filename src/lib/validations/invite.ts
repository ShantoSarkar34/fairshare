import { z } from "zod";

// 32 random bytes encoded as base64url is 43 characters.
export const inviteTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{32,64}$/, "Invalid invite link");