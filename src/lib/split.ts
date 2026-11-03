/**
 * Pure expense split algorithms.
 *
 * Every input and output amount is integer poisha in a bigint. These functions
 * have no dependency on React, Next.js, Prisma, auth or HTTP handlers.
 *
 * Output is always sorted by userId so identical inputs produce identical
 * results, regardless of the order participants were supplied in.
 */

/** 10,000 basis points = 100%. 1% = 100 basis points. */
const BASIS_POINTS_TOTAL = 10_000n;

export type SplitAllocation = {
  userId: string;
  amount: bigint;
};

export type ExactSplitEntry = {
  userId: string;
  amount: bigint;
};

export type PercentageSplitEntry = {
  userId: string;
  basisPoints: number;
};

export type SharesSplitEntry = {
  userId: string;
  shares: number;
};

/**
 * Splits equally. Poisha that cannot be divided evenly are given one at a
 * time to the first participants in userId order.
 *
 * Example: 10000n among A, B, C -> A 3334n, B 3333n, C 3333n.
 */
export function splitEqual(
  total: bigint,
  userIds: readonly string[],
): SplitAllocation[] {
  assertValidTotal(total);
  assertParticipantList(userIds);
  assertUniqueUserIds(userIds);

  const orderedUserIds = [...userIds].sort(compareUserIds);
  const participantCount = BigInt(orderedUserIds.length);
  const baseAmount = total / participantCount;
  const remainder = total % participantCount;

  return orderedUserIds.map((userId, index) => ({
    userId,
    amount: baseAmount + (BigInt(index) < remainder ? 1n : 0n),
  }));
}

/**
 * Uses explicitly supplied amounts. The amounts must be positive and must sum
 * exactly to the expense total; no poisha are guessed or redistributed.
 */
export function splitExact(
  total: bigint,
  entries: readonly ExactSplitEntry[],
): SplitAllocation[] {
  assertValidTotal(total);
  assertParticipantList(entries);
  assertUniqueUserIds(entries.map((entry) => entry.userId));

  let allocatedTotal = 0n;

  for (const entry of entries) {
    if (typeof entry.amount !== "bigint") {
      throw new TypeError(`Amount for "${entry.userId}" must be a bigint`);
    }

    if (entry.amount <= 0n) {
      throw new RangeError(`Amount for "${entry.userId}" must be greater than zero`);
    }

    allocatedTotal += entry.amount;
  }

  if (allocatedTotal !== total) {
    throw new RangeError(
      `Exact allocations sum to ${allocatedTotal} poisha, but the total is ${total} poisha`,
    );
  }

  return entries
    .map((entry) => ({ userId: entry.userId, amount: entry.amount }))
    .sort(compareAllocations);
}

/**
 * Splits by integer basis points. The basis points must be non-negative safe
 * integers and sum to exactly 10,000.
 *
 * Each exact share is floored, then leftover poisha go to the participants
 * with the largest fractional remainders. Ties are broken by userId.
 * A participant may deliberately receive 0 basis points; they then receive 0.
 */
export function splitPercentage(
  total: bigint,
  entries: readonly PercentageSplitEntry[],
): SplitAllocation[] {
  assertValidTotal(total);
  assertParticipantList(entries);
  assertUniqueUserIds(entries.map((entry) => entry.userId));

  const allocations: PendingAllocation[] = [];
  let totalBasisPoints = 0n;
  let allocatedTotal = 0n;

  for (const entry of entries) {
    if (
      !Number.isSafeInteger(entry.basisPoints) ||
      entry.basisPoints < 0
    ) {
      throw new RangeError(
        `Basis points for "${entry.userId}" must be a non-negative integer`,
      );
    }

    totalBasisPoints += BigInt(entry.basisPoints);

    const numerator = total * BigInt(entry.basisPoints);
    const amount = numerator / BASIS_POINTS_TOTAL;

    allocatedTotal += amount;
    allocations.push({
      userId: entry.userId,
      amount,
      remainder: numerator % BASIS_POINTS_TOTAL,
    });
  }

  if (totalBasisPoints !== BASIS_POINTS_TOTAL) {
    throw new RangeError(
      `Percentages must sum to 10000 basis points, received ${totalBasisPoints}`,
    );
  }

  distributeRemainder(allocations, total - allocatedTotal);

  return allocations
    .map(({ userId, amount }) => ({ userId, amount }))
    .sort(compareAllocations);
}

/**
 * Splits in proportion to positive integer share counts.
 *
 * Example: 100000n in a 2:1:1 ratio -> 50000n, 25000n, 25000n.
 * Leftover poisha use the same largest-remainder rule as percentage splits.
 */
export function splitShares(
  total: bigint,
  entries: readonly SharesSplitEntry[],
): SplitAllocation[] {
  assertValidTotal(total);
  assertParticipantList(entries);
  assertUniqueUserIds(entries.map((entry) => entry.userId));

  let totalShares = 0n;

  // Sum every share first: the denominator must include all participants.
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.shares) || entry.shares <= 0) {
      throw new RangeError(
        `Shares for "${entry.userId}" must be a positive integer`,
      );
    }

    totalShares += BigInt(entry.shares);
  }

  const allocations: PendingAllocation[] = [];
  let allocatedTotal = 0n;

  for (const entry of entries) {
    const numerator = total * BigInt(entry.shares);
    const amount = numerator / totalShares;

    allocatedTotal += amount;
    allocations.push({
      userId: entry.userId,
      amount,
      remainder: numerator % totalShares,
    });
  }

  distributeRemainder(allocations, total - allocatedTotal);

  return allocations
    .map(({ userId, amount }) => ({ userId, amount }))
    .sort(compareAllocations);
}

type PendingAllocation = {
  userId: string;
  amount: bigint;
  /** Fractional part left behind by integer division, used for fairness. */
  remainder: bigint;
};

/**
 * Gives one poisha each to the allocations with the largest remainders.
 * The caller guarantees that `remaining` is smaller than the list length.
 */
function distributeRemainder(
  allocations: PendingAllocation[],
  remaining: bigint,
): void {
  if (remaining === 0n) {
    return;
  }

  const count = Number(remaining);

  if (count > allocations.length) {
    throw new Error("Remainder is larger than the participant list");
  }

  allocations.sort((a, b) => {
    if (a.remainder !== b.remainder) {
      return a.remainder > b.remainder ? -1 : 1;
    }
    return compareUserIds(a.userId, b.userId);
  });

  for (let index = 0; index < count; index += 1) {
    allocations[index].amount += 1n;
  }
}

function assertValidTotal(total: bigint): void {
  if (typeof total !== "bigint") {
    throw new TypeError("Total must be a bigint");
  }

  if (total <= 0n) {
    throw new RangeError("Total must be greater than zero poisha");
  }
}

function assertParticipantList(entries: readonly unknown[]): void {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new RangeError("At least one participant is required");
  }
}

function assertUniqueUserIds(userIds: Iterable<string>): void {
  const seen = new Set<string>();

  for (const userId of userIds) {
    if (typeof userId !== "string" || userId.trim() === "") {
      throw new RangeError("Participant userId must be a non-empty string");
    }

    if (seen.has(userId)) {
      throw new RangeError(`Duplicate participant: "${userId}"`);
    }

    seen.add(userId);
  }
}

/** Plain UTF-16 comparison, so ordering does not depend on the machine locale. */
function compareUserIds(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function compareAllocations(a: SplitAllocation, b: SplitAllocation): number {
  return compareUserIds(a.userId, b.userId);
}
