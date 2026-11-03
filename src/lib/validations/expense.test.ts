import { describe, expect, it } from "vitest";

import { createExpenseSchema } from "./expense";

const BASE = {
  description: "Dinner",
  amount: "1200",
  expenseDate: "2026-11-03",
  paidById: "rafi",
};

const IDS = ["rafi", "nusrat", "karim"];

describe("createExpenseSchema", () => {
  it("parses an EQUAL expense and converts the amount to poisha", () => {
    const result = createExpenseSchema.safeParse({
      ...BASE,
      splitType: "EQUAL",
      participants: IDS.map((userId) => ({ userId })),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.amount).toBe(120_000n);
    expect(result.data.expenseDate.toISOString()).toBe(
      "2026-11-03T00:00:00.000Z",
    );
    expect(result.data.participants).toHaveLength(3);
  });

  it("parses EXACT amounts as exact bigint poisha", () => {
    const result = createExpenseSchema.safeParse({
      ...BASE,
      splitType: "EXACT",
      participants: [
        { userId: "rafi", amount: "400" },
        { userId: "nusrat", amount: "500.50" },
        { userId: "karim", amount: "299.50" },
      ],
    });

    expect(result.success).toBe(true);
    if (!result.success || result.data.splitType !== "EXACT") return;

    expect(result.data.participants[1].amount).toBe(50_050n);
  });

  it("parses percentages as integer basis points", () => {
    const result = createExpenseSchema.safeParse({
      ...BASE,
      splitType: "PERCENTAGE",
      participants: [
        { userId: "rafi", percentage: "50" },
        { userId: "nusrat", percentage: "33.33" },
        { userId: "karim", percentage: "16.67" },
      ],
    });

    expect(result.success).toBe(true);
    if (!result.success || result.data.splitType !== "PERCENTAGE") return;

    expect(result.data.participants.map((p) => p.basisPoints)).toEqual([
      5000, 3333, 1667,
    ]);
  });

  it("parses SHARES counts", () => {
    const result = createExpenseSchema.safeParse({
      ...BASE,
      splitType: "SHARES",
      participants: [
        { userId: "rafi", shares: 2 },
        { userId: "nusrat", shares: 1 },
        { userId: "karim", shares: 1 },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects an exact split whose amounts do not equal the total", () => {
    const result = createExpenseSchema.safeParse({
      ...BASE,
      splitType: "EXACT",
      participants: [
        { userId: "rafi", amount: "400" },
        { userId: "nusrat", amount: "400" },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects percentages that do not total exactly 100%", () => {
    const result = createExpenseSchema.safeParse({
      ...BASE,
      splitType: "PERCENTAGE",
      participants: [
        { userId: "rafi", percentage: "50" },
        { userId: "nusrat", percentage: "40" },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects zero, negative and non-integer shares", () => {
    for (const shares of [0, -1, 1.5]) {
      const result = createExpenseSchema.safeParse({
        ...BASE,
        splitType: "SHARES",
        participants: [{ userId: "rafi", shares }],
      });

      expect(result.success).toBe(false);
    }
  });

  it("rejects duplicate participants", () => {
    const result = createExpenseSchema.safeParse({
      ...BASE,
      splitType: "EQUAL",
      participants: [{ userId: "rafi" }, { userId: "rafi" }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty participant list", () => {
    const result = createExpenseSchema.safeParse({
      ...BASE,
      splitType: "EQUAL",
      participants: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a blank description", () => {
    const result = createExpenseSchema.safeParse({
      ...BASE,
      description: "   ",
      splitType: "EQUAL",
      participants: IDS.map((userId) => ({ userId })),
    });

    expect(result.success).toBe(false);
  });

  it("rejects zero, negative and over-precise amounts", () => {
    for (const amount of ["0", "-1", "1.001", "abc", "1,000"]) {
      const result = createExpenseSchema.safeParse({
        ...BASE,
        amount,
        splitType: "EQUAL",
        participants: IDS.map((userId) => ({ userId })),
      });

      expect(result.success).toBe(false);
    }
  });

  it("rejects amounts outside the PostgreSQL BIGINT range", () => {
    const result = createExpenseSchema.safeParse({
      ...BASE,
      amount: "92233720368547758.08",
      splitType: "EQUAL",
      participants: IDS.map((userId) => ({ userId })),
    });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid calendar date", () => {
    const result = createExpenseSchema.safeParse({
      ...BASE,
      expenseDate: "2026-02-30",
      splitType: "EQUAL",
      participants: IDS.map((userId) => ({ userId })),
    });

    expect(result.success).toBe(false);
  });

  it("rejects a participant percentage above 100", () => {
    const result = createExpenseSchema.safeParse({
      ...BASE,
      splitType: "PERCENTAGE",
      participants: [{ userId: "rafi", percentage: "100.01" }],
    });

    expect(result.success).toBe(false);
  });
});
