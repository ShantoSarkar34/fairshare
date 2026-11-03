import { z } from "zod";

import { EXPENSE_DESCRIPTION_MAX } from "@/lib/expenses/types";
import { parseMoneyToPoisha } from "@/lib/money";
import { parsePercentageToBasisPoints } from "@/lib/percentage";
import { idSchema } from "@/lib/validations/common";

/** PostgreSQL BIGINT is signed 64-bit. */
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

/** PostgreSQL INTEGER is signed 32-bit. */
const MAX_POSTGRES_INT = 2_147_483_647;

const BASIS_POINTS_TOTAL = 10_000;

/** Parses a positive decimal amount and converts it to exact poisha. */
function moneySchema(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .transform((value, ctx) => {
      try {
        const poisha = parseMoneyToPoisha(value);

        if (poisha <= 0n) {
          ctx.addIssue({
            code: "custom",
            message: `${label} must be greater than zero`,
          });
          return z.NEVER;
        }

        if (poisha > MAX_POSTGRES_BIGINT) {
          ctx.addIssue({
            code: "custom",
            message: `${label} is too large`,
          });
          return z.NEVER;
        }

        return poisha;
      } catch (error) {
        ctx.addIssue({
          code: "custom",
          message:
            error instanceof Error ? error.message : `Invalid ${label.toLowerCase()}`,
        });
        return z.NEVER;
      }
    });
}

function percentageSchema() {
  return z
    .string()
    .trim()
    .min(1, "Percentage is required")
    .transform((value, ctx) => {
      try {
        return parsePercentageToBasisPoints(value);
      } catch (error) {
        ctx.addIssue({
          code: "custom",
          message:
            error instanceof Error ? error.message : "Invalid percentage",
        });
        return z.NEVER;
      }
    });
}

/** Parses a YYYY-MM-DD form value as a UTC date, avoiding timezone shifts. */
function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

const expenseDateSchema = z
  .string()
  .trim()
  .min(1, "Expense date is required")
  .transform((value, ctx) => {
    const date = parseDateOnly(value);

    if (!date) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid expense date",
      });
      return z.NEVER;
    }

    return date;
  });

const baseFields = {
  description: z
    .string()
    .trim()
    .min(1, "Description is required")
    .max(
      EXPENSE_DESCRIPTION_MAX,
      `Description must be ${EXPENSE_DESCRIPTION_MAX} characters or fewer`,
    ),
  amount: moneySchema("Total amount"),
  expenseDate: expenseDateSchema,
  paidById: idSchema,
};

const equalParticipantSchema = z.object({
  userId: idSchema,
});

const exactParticipantSchema = z.object({
  userId: idSchema,
  amount: moneySchema("Participant amount"),
});

const percentageParticipantSchema = z
  .object({
    userId: idSchema,
    percentage: percentageSchema(),
  })
  .transform((entry) => ({
    userId: entry.userId,
    basisPoints: entry.percentage,
  }));

const sharesParticipantSchema = z.object({
  userId: idSchema,
  shares: z
    .number()
    .int("Shares must be a whole number")
    .positive("Shares must be greater than zero")
    .max(MAX_POSTGRES_INT, "Shares value is too large"),
});

const expenseInputSchema = z
  .discriminatedUnion("splitType", [
    z.object({
      ...baseFields,
      splitType: z.literal("EQUAL"),
      participants: z
        .array(equalParticipantSchema)
        .min(1, "Select at least one participant"),
    }),
    z.object({
      ...baseFields,
      splitType: z.literal("EXACT"),
      participants: z
        .array(exactParticipantSchema)
        .min(1, "Select at least one participant"),
    }),
    z.object({
      ...baseFields,
      splitType: z.literal("PERCENTAGE"),
      participants: z
        .array(percentageParticipantSchema)
        .min(1, "Select at least one participant"),
    }),
    z.object({
      ...baseFields,
      splitType: z.literal("SHARES"),
      participants: z
        .array(sharesParticipantSchema)
        .min(1, "Select at least one participant"),
    }),
  ])
  .superRefine((value, ctx) => {
    const userIds = value.participants.map((participant) => participant.userId);

    if (new Set(userIds).size !== userIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["participants"],
        message: "Each participant can appear only once",
      });
    }

    if (value.splitType === "EXACT") {
      const allocated = value.participants.reduce(
        (sum, participant) => sum + participant.amount,
        0n,
      );

      if (allocated !== value.amount) {
        ctx.addIssue({
          code: "custom",
          path: ["participants"],
          message: "Exact amounts must add up to the total amount",
        });
      }
    }

    if (value.splitType === "PERCENTAGE") {
      const basisPoints = value.participants.reduce(
        (sum, participant) => sum + participant.basisPoints,
        0,
      );

      if (basisPoints !== BASIS_POINTS_TOTAL) {
        ctx.addIssue({
          code: "custom",
          path: ["participants"],
          message: "Percentages must add up to exactly 100%",
        });
      }
    }
  });

export const createExpenseSchema = expenseInputSchema;

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
