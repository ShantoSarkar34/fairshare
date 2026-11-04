import { describe, expect, it } from "vitest";

import {
  BalanceCalculationError,
  calculateGroupBalances,
  type BalanceExpense,
  type BalanceMember,
  type GroupBalance,
} from "./balance";

const rafi = { userId: "rafi", name: "Rafi" };
const nusrat = { userId: "nusrat", name: "Nusrat" };
const karim = { userId: "karim", name: "Karim" };

function member(userId: string): BalanceMember {
  return { userId, name: userId.toUpperCase() };
}

function expense(
  input: Omit<BalanceExpense, "description" | "expenseDate"> & {
    description?: string;
    expenseDate?: string;
  },
): BalanceExpense {
  return {
    description: input.id,
    expenseDate: "2026-11-03",
    ...input,
  };
}

function balanceFor(result: GroupBalance, userId: string) {
  const found = result.members.find((member) => member.userId === userId);
  if (!found) throw new Error(`No balance for ${userId}`);
  return found;
}

function netTotal(result: GroupBalance): bigint {
  return result.members.reduce((total, member) => total + member.net, 0n);
}

describe("calculateGroupBalances", () => {
  it("calculates the ৳900 Rafi/Nusrat/Karim example", () => {
    const result = calculateGroupBalances(
      [rafi, nusrat, karim],
      [
        expense({
          id: "dinner",
          amount: 90_000n,
          paidById: "rafi",
          participants: [
            { userId: "rafi", shareAmount: 30_000n },
            { userId: "nusrat", shareAmount: 30_000n },
            { userId: "karim", shareAmount: 30_000n },
          ],
        }),
      ],
    );

    expect(result.totalExpenses).toBe(90_000n);
    expect(balanceFor(result, "rafi")).toMatchObject({
      paid: 90_000n,
      share: 30_000n,
      net: 60_000n,
      status: "owed",
    });
    expect(balanceFor(result, "nusrat")).toMatchObject({
      paid: 0n,
      share: 30_000n,
      net: -30_000n,
      status: "owes",
    });
    expect(balanceFor(result, "karim")).toMatchObject({
      paid: 0n,
      share: 30_000n,
      net: -30_000n,
      status: "owes",
    });
    expect(netTotal(result)).toBe(0n);
  });

  it("credits a payer who did not participate in the expense", () => {
    const result = calculateGroupBalances(
      [rafi, nusrat, karim],
      [
        expense({
          id: "taxi",
          amount: 90_000n,
          paidById: "rafi",
          participants: [
            { userId: "nusrat", shareAmount: 45_000n },
            { userId: "karim", shareAmount: 45_000n },
          ],
        }),
      ],
    );

    expect(balanceFor(result, "rafi")).toMatchObject({
      paid: 90_000n,
      share: 0n,
      net: 90_000n,
      status: "owed",
    });
    expect(balanceFor(result, "nusrat").net).toBe(-45_000n);
    expect(balanceFor(result, "karim").net).toBe(-45_000n);
    expect(netTotal(result)).toBe(0n);
  });

  it("handles a payer who is also a participant", () => {
    const result = calculateGroupBalances(
      [rafi, nusrat],
      [
        expense({
          id: "lunch",
          amount: 10_000n,
          paidById: "rafi",
          participants: [
            { userId: "rafi", shareAmount: 10_000n },
            { userId: "nusrat", shareAmount: 0n },
          ],
        }),
      ],
    );

    expect(balanceFor(result, "rafi").net).toBe(0n);
    expect(balanceFor(result, "rafi").status).toBe("settled");
    expect(balanceFor(result, "nusrat").net).toBe(0n);
    expect(balanceFor(result, "nusrat").status).toBe("settled");
  });

  it("combines multiple expenses with different participant sets", () => {
    const result = calculateGroupBalances(
      [member("a"), member("b"), member("c"), member("d")],
      [
        expense({
          id: "expense-1",
          amount: 10_000n,
          paidById: "a",
          participants: [
            { userId: "a", shareAmount: 5_000n },
            { userId: "b", shareAmount: 5_000n },
          ],
        }),
        expense({
          id: "expense-2",
          amount: 6_000n,
          paidById: "b",
          participants: [
            { userId: "b", shareAmount: 2_000n },
            { userId: "c", shareAmount: 4_000n },
          ],
        }),
      ],
    );

    expect(result.totalExpenses).toBe(16_000n);
    expect(balanceFor(result, "a").net).toBe(5_000n);
    expect(balanceFor(result, "b").net).toBe(-1_000n);
    expect(balanceFor(result, "c").net).toBe(-4_000n);
    expect(balanceFor(result, "d")).toMatchObject({
      paid: 0n,
      share: 0n,
      net: 0n,
      status: "settled",
      entries: [],
    });
    expect(netTotal(result)).toBe(0n);
  });

  it("applies a settlement to reduce a debtor's debt and a creditor's credit", () => {
    const result = calculateGroupBalances(
      [rafi, nusrat],
      [
        expense({
          id: "dinner",
          amount: 30_000n,
          paidById: "rafi",
          participants: [
            { userId: "rafi", shareAmount: 0n },
            { userId: "nusrat", shareAmount: 30_000n },
          ],
        }),
      ],
      [
        {
          id: "settlement-1",
          fromUserId: "nusrat",
          toUserId: "rafi",
          amount: 30_000n,
          method: "BKASH",
          settledAt: "2026-11-04T10:00:00.000Z",
        },
      ],
    );

    expect(balanceFor(result, "rafi")).toMatchObject({
      paid: 30_000n,
      share: 0n,
      settlementsSent: 0n,
      settlementsReceived: 30_000n,
      net: 0n,
      status: "settled",
    });
    expect(balanceFor(result, "nusrat")).toMatchObject({
      paid: 0n,
      share: 30_000n,
      settlementsSent: 30_000n,
      settlementsReceived: 0n,
      net: 0n,
      status: "settled",
    });
    expect(balanceFor(result, "nusrat").settlementEntries[0]).toMatchObject({
      settlementId: "settlement-1",
      amount: 30_000n,
      effect: 30_000n,
      method: "BKASH",
    });
    expect(balanceFor(result, "rafi").settlementEntries[0]).toMatchObject({
      settlementId: "settlement-1",
      effect: -30_000n,
    });
    expect(netTotal(result)).toBe(0n);
  });

  it("combines multiple settlements with expenses", () => {
    const result = calculateGroupBalances(
      [rafi, nusrat, karim],
      [
        expense({
          id: "dinner",
          amount: 90_000n,
          paidById: "rafi",
          participants: [
            { userId: "rafi", shareAmount: 30_000n },
            { userId: "nusrat", shareAmount: 30_000n },
            { userId: "karim", shareAmount: 30_000n },
          ],
        }),
      ],
      [
        {
          id: "s1",
          fromUserId: "nusrat",
          toUserId: "rafi",
          amount: 10_000n,
          method: "CASH",
        },
        {
          id: "s2",
          fromUserId: "karim",
          toUserId: "rafi",
          amount: 20_000n,
          method: "BANK",
        },
      ],
    );

    expect(balanceFor(result, "rafi").net).toBe(30_000n);
    expect(balanceFor(result, "nusrat").net).toBe(-20_000n);
    expect(balanceFor(result, "karim").net).toBe(-10_000n);
    expect(balanceFor(result, "rafi").settlementEntries).toHaveLength(2);
    expect(netTotal(result)).toBe(0n);
  });

  it("returns settled zero balances for a group with no expenses", () => {
    const result = calculateGroupBalances([rafi, nusrat, karim], []);

    expect(result.totalExpenses).toBe(0n);
    expect(result.members).toHaveLength(3);
    expect(result.members.every((member) => member.net === 0n)).toBe(true);
    expect(result.members.every((member) => member.status === "settled")).toBe(
      true,
    );
    expect(result.members.every((member) => member.entries.length === 0)).toBe(
      true,
    );
  });

  it("handles an empty group", () => {
    const result = calculateGroupBalances([], []);

    expect(result).toEqual({ totalExpenses: 0n, members: [] });
  });

  it("handles stored EQUAL allocations", () => {
    const result = calculateGroupBalances(
      [rafi, nusrat, karim],
      [
        expense({
          id: "equal",
          amount: 10_000n,
          paidById: "rafi",
          participants: [
            { userId: "rafi", shareAmount: 3_334n },
            { userId: "nusrat", shareAmount: 3_333n },
            { userId: "karim", shareAmount: 3_333n },
          ],
        }),
      ],
    );

    expect(balanceFor(result, "rafi").net).toBe(6_666n);
    expect(balanceFor(result, "nusrat").net).toBe(-3_333n);
    expect(balanceFor(result, "karim").net).toBe(-3_333n);
    expect(netTotal(result)).toBe(0n);
  });

  it("handles stored EXACT allocations", () => {
    const result = calculateGroupBalances(
      [rafi, nusrat, karim],
      [
        expense({
          id: "exact",
          amount: 10_000n,
          paidById: "rafi",
          participants: [
            { userId: "rafi", shareAmount: 1_000n },
            { userId: "nusrat", shareAmount: 4_000n },
            { userId: "karim", shareAmount: 5_000n },
          ],
        }),
      ],
    );

    expect(balanceFor(result, "rafi").net).toBe(9_000n);
    expect(balanceFor(result, "nusrat").net).toBe(-4_000n);
    expect(balanceFor(result, "karim").net).toBe(-5_000n);
    expect(netTotal(result)).toBe(0n);
  });

  it("handles stored PERCENTAGE allocations", () => {
    const result = calculateGroupBalances(
      [rafi, nusrat, karim],
      [
        expense({
          id: "percentage",
          amount: 10_000n,
          paidById: "nusrat",
          participants: [
            { userId: "rafi", shareAmount: 5_000n },
            { userId: "nusrat", shareAmount: 3_000n },
            { userId: "karim", shareAmount: 2_000n },
          ],
        }),
      ],
    );

    expect(balanceFor(result, "rafi").net).toBe(-5_000n);
    expect(balanceFor(result, "nusrat").net).toBe(7_000n);
    expect(balanceFor(result, "karim").net).toBe(-2_000n);
    expect(netTotal(result)).toBe(0n);
  });

  it("handles stored SHARES allocations", () => {
    const result = calculateGroupBalances(
      [rafi, nusrat, karim],
      [
        expense({
          id: "shares",
          amount: 10_000n,
          paidById: "karim",
          participants: [
            { userId: "rafi", shareAmount: 5_000n },
            { userId: "nusrat", shareAmount: 2_500n },
            { userId: "karim", shareAmount: 2_500n },
          ],
        }),
      ],
    );

    expect(balanceFor(result, "rafi").net).toBe(-5_000n);
    expect(balanceFor(result, "nusrat").net).toBe(-2_500n);
    expect(balanceFor(result, "karim").net).toBe(7_500n);
    expect(netTotal(result)).toBe(0n);
  });

  it("handles large BigInt amounts without losing precision", () => {
    const largeAmount = 9_000_000_000_000_000n;
    const result = calculateGroupBalances(
      [rafi, nusrat, karim],
      [
        expense({
          id: "large",
          amount: largeAmount,
          paidById: "rafi",
          participants: [
            { userId: "rafi", shareAmount: 3_000_000_000_000_000n },
            { userId: "nusrat", shareAmount: 3_000_000_000_000_000n },
            { userId: "karim", shareAmount: 3_000_000_000_000_000n },
          ],
        }),
      ],
    );

    expect(result.totalExpenses).toBe(largeAmount);
    expect(balanceFor(result, "rafi").net).toBe(6_000_000_000_000_000n);
    expect(balanceFor(result, "nusrat").net).toBe(-3_000_000_000_000_000n);
    expect(netTotal(result)).toBe(0n);
  });

  it("builds a per-expense breakdown for each affected member", () => {
    const result = calculateGroupBalances(
      [rafi, nusrat, karim],
      [
        expense({
          id: "dinner",
          description: "Dinner",
          amount: 90_000n,
          paidById: "rafi",
          participants: [
            { userId: "rafi", shareAmount: 30_000n },
            { userId: "nusrat", shareAmount: 30_000n },
            { userId: "karim", shareAmount: 30_000n },
          ],
        }),
      ],
    );

    expect(balanceFor(result, "rafi").entries).toEqual([
      {
        expenseId: "dinner",
        description: "Dinner",
        expenseDate: "2026-11-03",
        paid: 90_000n,
        share: 30_000n,
        effect: 60_000n,
      },
    ]);
    expect(balanceFor(result, "nusrat").entries[0]).toMatchObject({
      paid: 0n,
      share: 30_000n,
      effect: -30_000n,
    });
    expect(balanceFor(result, "karim").entries[0]).toMatchObject({
      paid: 0n,
      share: 30_000n,
      effect: -30_000n,
    });
  });

  describe("invalid data", () => {
    it("rejects duplicate group members", () => {
      expect(() =>
        calculateGroupBalances([rafi, { ...rafi }], []),
      ).toThrow(BalanceCalculationError);
    });

    it("rejects duplicate expense ids", () => {
      const first = expense({
        id: "same",
        amount: 10_000n,
        paidById: "rafi",
        participants: [{ userId: "rafi", shareAmount: 10_000n }],
      });

      expect(() =>
        calculateGroupBalances([rafi], [first, { ...first }]),
      ).toThrow(BalanceCalculationError);
    });

    it("rejects a payer outside the member list", () => {
      expect(() =>
        calculateGroupBalances(
          [rafi],
          [
            expense({
              id: "bad-payer",
              amount: 10_000n,
              paidById: "stranger",
              participants: [{ userId: "rafi", shareAmount: 10_000n }],
            }),
          ],
        ),
      ).toThrow(BalanceCalculationError);
    });

    it("rejects a participant outside the member list", () => {
      expect(() =>
        calculateGroupBalances(
          [rafi],
          [
            expense({
              id: "bad-participant",
              amount: 10_000n,
              paidById: "rafi",
              participants: [
                { userId: "rafi", shareAmount: 5_000n },
                { userId: "stranger", shareAmount: 5_000n },
              ],
            }),
          ],
        ),
      ).toThrow(BalanceCalculationError);
    });

    it("rejects duplicate participants in one expense", () => {
      expect(() =>
        calculateGroupBalances(
          [rafi, nusrat],
          [
            expense({
              id: "duplicate-participant",
              amount: 10_000n,
              paidById: "rafi",
              participants: [
                { userId: "nusrat", shareAmount: 5_000n },
                { userId: "nusrat", shareAmount: 5_000n },
              ],
            }),
          ],
        ),
      ).toThrow(BalanceCalculationError);
    });

    it("rejects negative and non-bigint shares", () => {
      expect(() =>
        calculateGroupBalances(
          [rafi],
          [
            expense({
              id: "negative-share",
              amount: 10_000n,
              paidById: "rafi",
              participants: [{ userId: "rafi", shareAmount: -1n }],
            }),
          ],
        ),
      ).toThrow(BalanceCalculationError);

      expect(() =>
        calculateGroupBalances(
          [rafi],
          [
            expense({
              id: "number-share",
              amount: 10_000n,
              paidById: "rafi",
              participants: [
                {
                  userId: "rafi",
                  shareAmount: 10_000 as unknown as bigint,
                },
              ],
            }),
          ],
        ),
      ).toThrow(BalanceCalculationError);
    });

    it("rejects allocations that do not equal the expense total", () => {
      expect(() =>
        calculateGroupBalances(
          [rafi, nusrat],
          [
            expense({
              id: "bad-sum",
              amount: 10_000n,
              paidById: "rafi",
              participants: [
                { userId: "rafi", shareAmount: 4_000n },
                { userId: "nusrat", shareAmount: 4_000n },
              ],
            }),
          ],
        ),
      ).toThrow(BalanceCalculationError);
    });

    it("rejects an expense with no participants", () => {
      expect(() =>
        calculateGroupBalances(
          [rafi],
          [
            expense({
              id: "no-participants",
              amount: 10_000n,
              paidById: "rafi",
              participants: [],
            }),
          ],
        ),
      ).toThrow(BalanceCalculationError);
    });

    it("rejects zero or negative expense amounts", () => {
      for (const amount of [0n, -10_000n]) {
        expect(() =>
          calculateGroupBalances(
            [rafi],
            [
              expense({
                id: "bad-amount",
                amount,
                paidById: "rafi",
                participants: [{ userId: "rafi", shareAmount: amount }],
              }),
            ],
          ),
        ).toThrow(BalanceCalculationError);
      }
    });

    it("rejects invalid settlements", () => {
      expect(() =>
        calculateGroupBalances([rafi, nusrat], [], [
          {
            id: "same-party",
            fromUserId: "rafi",
            toUserId: "rafi",
            amount: 10_000n,
          },
        ]),
      ).toThrow(BalanceCalculationError);

      expect(() =>
        calculateGroupBalances([rafi, nusrat], [], [
          {
            id: "unknown-party",
            fromUserId: "rafi",
            toUserId: "stranger",
            amount: 10_000n,
          },
        ]),
      ).toThrow(BalanceCalculationError);

      expect(() =>
        calculateGroupBalances([rafi, nusrat], [], [
          {
            id: "bad-amount",
            fromUserId: "rafi",
            toUserId: "nusrat",
            amount: 0n,
          },
        ]),
      ).toThrow(BalanceCalculationError);
    });
  });
});
