import { z } from "zod";

import { parseMoneyToPoisha } from "@/lib/money";

const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

export const bkashAmountSchema = z
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
