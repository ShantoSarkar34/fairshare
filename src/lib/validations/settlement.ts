import { z } from "zod";

import { parseMoneyToPoisha } from "@/lib/money";
import { idSchema } from "@/lib/validations/common";

/** PostgreSQL BIGINT is signed 64-bit. */
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

const amountSchema = z
  .string()
  .trim()
  .min(1, "Amount is required")
  .transform((value, ctx) => {
    try {
      const poisha = parseMoneyToPoisha(value);

      if (poisha <= 0n) {
        ctx.addIssue({
          code: "custom",
          message: "Amount must be greater than zero",
        });
        return z.NEVER;
      }

      if (poisha > MAX_POSTGRES_BIGINT) {
        ctx.addIssue({
          code: "custom",
          message: "Amount is too large",
        });
        return z.NEVER;
      }

      return poisha;
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : "Enter a valid amount",
      });
      return z.NEVER;
    }
  });

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .optional()
    .transform((value) => (value ? value : undefined));

export const recordSettlementSchema = z
  .object({
    fromUserId: idSchema,
    toUserId: idSchema,
    amount: amountSchema,
    method: z.enum(["BKASH", "CASH", "BANK"]),
    transactionReference: optionalText(120, "Transaction reference"),
    note: optionalText(500, "Note"),
  })
  .superRefine((value, ctx) => {
    if (value.fromUserId === value.toUserId) {
      ctx.addIssue({
        code: "custom",
        path: ["toUserId"],
        message: "Sender and receiver must be different people",
      });
    }
  });

export type RecordSettlementInput = z.infer<typeof recordSettlementSchema>;
