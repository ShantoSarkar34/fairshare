import { describe, expect, it } from "vitest";

import {
  calculateSettlements,
  SettlementCalculationError,
  type SettlementBalance,
  type SuggestedTransfer,
} from "./settlement";

function applyTransfers(
  balances: SettlementBalance[],
  transfers: SuggestedTransfer[],
): Map<string, bigint> {
  const result = new Map(
    balances.map((balance) => [balance.userId, balance.net]),
  );

  for (const transfer of transfers) {
    result.set(
      transfer.fromUserId,
      (result.get(transfer.fromUserId) ?? 0n) + transfer.amount,
    );
    result.set(
      transfer.toUserId,
      (result.get(transfer.toUserId) ?? 0n) - transfer.amount,
    );
  }

  return result;
}

function expectAllSettled(
  balances: SettlementBalance[],
  transfers: SuggestedTransfer[],
) {
  const result = applyTransfers(balances, transfers);

  for (const balance of balances) {
    expect(result.get(balance.userId)).toBe(0n);
  }
}

describe("calculateSettlements", () => {
  it("matches one debtor with one creditor", () => {
    const balances = [
      { userId: "creditor", net: 30_000n },
      { userId: "debtor", net: -30_000n },
    ];

    expect(calculateSettlements(balances)).toEqual([
      { fromUserId: "debtor", toUserId: "creditor", amount: 30_000n },
    ]);
  });

  it("matches multiple debtors and creditors in the example", () => {
    const balances = [
      { userId: "rafi", net: 60_000n },
      { userId: "nusrat", net: -30_000n },
      { userId: "karim", net: -30_000n },
    ];

    expect(calculateSettlements(balances)).toEqual([
      { fromUserId: "karim", toUserId: "rafi", amount: 30_000n },
      { fromUserId: "nusrat", toUserId: "rafi", amount: 30_000n },
    ]);
  });

  it("matches several debtors and creditors without overpaying", () => {
    const balances = [
      { userId: "a", net: 70_000n },
      { userId: "b", net: 30_000n },
      { userId: "c", net: -50_000n },
      { userId: "d", net: -50_000n },
    ];

    const transfers = calculateSettlements(balances);

    expect(transfers).toEqual([
      { fromUserId: "c", toUserId: "a", amount: 50_000n },
      { fromUserId: "d", toUserId: "a", amount: 20_000n },
      { fromUserId: "d", toUserId: "b", amount: 30_000n },
    ]);
    expectAllSettled(balances, transfers);
  });

  it("returns no transfers for an already settled group", () => {
    expect(
      calculateSettlements([
        { userId: "a", net: 0n },
        { userId: "b", net: 0n },
      ]),
    ).toEqual([]);
  });

  it("returns no transfers for an empty group", () => {
    expect(calculateSettlements([])).toEqual([]);
  });

  it("rejects unequal total credits and debts", () => {
    expect(() =>
      calculateSettlements([
        { userId: "a", net: 10_000n },
        { userId: "b", net: -9_999n },
      ]),
    ).toThrow(SettlementCalculationError);
  });

  it("handles very large BigInt balances", () => {
    const large = 9_000_000_000_000_000n;
    const balances = [
      { userId: "a", net: large },
      { userId: "b", net: -large },
    ];

    expect(calculateSettlements(balances)).toEqual([
      { fromUserId: "b", toUserId: "a", amount: large },
    ]);
  });

  it("is deterministic regardless of input order", () => {
    const first = calculateSettlements([
      { userId: "a", net: 70_000n },
      { userId: "b", net: 30_000n },
      { userId: "c", net: -50_000n },
      { userId: "d", net: -50_000n },
    ]);

    const second = calculateSettlements([
      { userId: "d", net: -50_000n },
      { userId: "b", net: 30_000n },
      { userId: "a", net: 70_000n },
      { userId: "c", net: -50_000n },
    ]);

    expect(second).toEqual(first);
  });

  it("never suggests a zero or negative payment", () => {
    const transfers = calculateSettlements([
      { userId: "a", net: 100_000n },
      { userId: "b", net: -100_000n },
      { userId: "c", net: 0n },
    ]);

    expect(transfers).toHaveLength(1);
    expect(transfers[0]?.amount).toBeGreaterThan(0n);
  });

  it("never suggests a payment larger than remaining debt or credit", () => {
    const balances = [
      { userId: "a", net: 25_000n },
      { userId: "b", net: 75_000n },
      { userId: "c", net: -50_000n },
      { userId: "d", net: -50_000n },
    ];

    const transfers = calculateSettlements(balances);
    const remainingDebt = new Map(
      balances
        .filter((balance) => balance.net < 0n)
        .map((balance) => [balance.userId, -balance.net]),
    );
    const remainingCredit = new Map(
      balances
        .filter((balance) => balance.net > 0n)
        .map((balance) => [balance.userId, balance.net]),
    );

    for (const transfer of transfers) {
      expect(transfer.amount).toBeGreaterThan(0n);
      expect(transfer.amount).toBeLessThanOrEqual(
        remainingDebt.get(transfer.fromUserId) ?? 0n,
      );
      expect(transfer.amount).toBeLessThanOrEqual(
        remainingCredit.get(transfer.toUserId) ?? 0n,
      );

      remainingDebt.set(
        transfer.fromUserId,
        (remainingDebt.get(transfer.fromUserId) ?? 0n) - transfer.amount,
      );
      remainingCredit.set(
        transfer.toUserId,
        (remainingCredit.get(transfer.toUserId) ?? 0n) - transfer.amount,
      );
    }

    expectAllSettled(balances, transfers);
  });

  it("settles every balance when the total is zero", () => {
    const balances = [
      { userId: "a", net: 12_345n },
      { userId: "b", net: 67_655n },
      { userId: "c", net: -30_000n },
      { userId: "d", net: -50_000n },
    ];

    const transfers = calculateSettlements(balances);
    expectAllSettled(balances, transfers);

    const total = balances.reduce((sum, balance) => sum + balance.net, 0n);
    expect(total).toBe(0n);
  });

  it("does not mutate the input balances", () => {
    const balances = [
      { userId: "a", net: 10_000n },
      { userId: "b", net: -10_000n },
    ];

    calculateSettlements(balances);

    expect(balances).toEqual([
      { userId: "a", net: 10_000n },
      { userId: "b", net: -10_000n },
    ]);
  });

  it("rejects duplicate members and non-bigint amounts", () => {
    expect(() =>
      calculateSettlements([
        { userId: "a", net: 10_000n },
        { userId: "a", net: -10_000n },
      ]),
    ).toThrow(SettlementCalculationError);

    expect(() =>
      calculateSettlements([
        { userId: "a", net: 10_000 as unknown as bigint },
        { userId: "b", net: -10_000n },
      ]),
    ).toThrow(SettlementCalculationError);
  });
});
