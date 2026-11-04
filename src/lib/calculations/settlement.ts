/**
 * Pure settlement suggestion calculations.
 *
 * This module is deterministic and has no dependencies on React, Prisma, auth,
 * HTTP or the database. Amounts are integer poisha in bigint.
 *
 * The greedy algorithm guarantees:
 *   - every suggested amount is positive;
 *   - no payment exceeds the remaining debt or remaining credit;
 *   - all balances are settled when the net total is zero;
 *   - the same input always produces the same transfers.
 *
 * It does NOT guarantee the globally minimum number of transactions. Greedy
 * matching is intentionally simple and can produce more transfers than a more
 * expensive matching algorithm.
 */

export type SettlementBalance = {
  userId: string;
  net: bigint;
};

export type SuggestedTransfer = {
  fromUserId: string;
  toUserId: string;
  amount: bigint;
};

export class SettlementCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementCalculationError";
  }
}

type RemainingBalance = {
  userId: string;
  remaining: bigint;
};

/**
 * Produces deterministic suggested transfers from current net balances.
 * Positive net means the member is a creditor; negative means a debtor.
 */
export function calculateSettlements(
  balances: readonly SettlementBalance[],
): SuggestedTransfer[] {
  if (!Array.isArray(balances)) {
    throw new SettlementCalculationError("Balances must be an array");
  }

  const seenUserIds = new Set<string>();
  let netTotal = 0n;

  for (const balance of balances) {
    if (typeof balance.userId !== "string" || balance.userId.trim() === "") {
      throw new SettlementCalculationError(
        "Each balance must have a non-empty user id",
      );
    }

    if (seenUserIds.has(balance.userId)) {
      throw new SettlementCalculationError(
        `Duplicate balance for user "${balance.userId}"`,
      );
    }
    seenUserIds.add(balance.userId);

    if (typeof balance.net !== "bigint") {
      throw new SettlementCalculationError(
        `Balance for user "${balance.userId}" must be a bigint`,
      );
    }

    netTotal += balance.net;
  }

  if (netTotal !== 0n) {
    throw new SettlementCalculationError(
      "Settlement balances must add up to zero",
    );
  }

  const debtors: RemainingBalance[] = balances
    .filter((balance) => balance.net < 0n)
    .map(
      (balance): RemainingBalance => ({
        userId: balance.userId,
        remaining: 0n - balance.net,
      }),
    )
    .sort(compareByUserId);

  const creditors: RemainingBalance[] = balances
    .filter((balance) => balance.net > 0n)
    .map(
      (balance): RemainingBalance => ({
        userId: balance.userId,
        remaining: balance.net,
      }),
    )
    .sort(compareByUserId);

  const transfers: SuggestedTransfer[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount =
      debtor.remaining < creditor.remaining
        ? debtor.remaining
        : creditor.remaining;

    if (amount <= 0n) {
      throw new SettlementCalculationError(
        "Settlement produced a non-positive transfer",
      );
    }

    transfers.push({
      fromUserId: debtor.userId,
      toUserId: creditor.userId,
      amount,
    });

    debtor.remaining -= amount;
    creditor.remaining -= amount;

    if (debtor.remaining === 0n) debtorIndex += 1;
    if (creditor.remaining === 0n) creditorIndex += 1;
  }

  const unsettled = [...debtors, ...creditors].some(
    (balance) => balance.remaining !== 0n,
  );

  if (unsettled) {
    throw new SettlementCalculationError(
      "Settlement balances could not be fully matched",
    );
  }

  return transfers;
}

/** Locale-independent ordering keeps suggestions stable across runtimes. */
function compareByUserId(a: RemainingBalance, b: RemainingBalance): number {
  if (a.userId < b.userId) return -1;
  if (a.userId > b.userId) return 1;
  return 0;
}
