/**
 * Pure group-balance calculations.
 *
 * Sign convention:
 *   positive net = the member is owed money
 *   negative net = the member owes money
 *   zero net     = the member is settled
 *
 * All monetary values are integer poisha in bigint. This module has no
 * dependency on React, Next.js, Prisma, auth or HTTP.
 */

export type BalanceStatus = "owed" | "owes" | "settled";

export type BalanceMember = {
  userId: string;
  name: string;
};

export type BalanceAllocation = {
  userId: string;
  shareAmount: bigint;
};

export type BalanceExpense = {
  id: string;
  description: string;
  amount: bigint;
  paidById: string;
  /** Optional display date; it does not affect the arithmetic. */
  expenseDate?: string;
  participants: readonly BalanceAllocation[];
};

export type BalanceEntry = {
  expenseId: string;
  description: string;
  expenseDate?: string;
  paid: bigint;
  share: bigint;
  effect: bigint;
};

export type MemberBalance = {
  userId: string;
  name: string;
  paid: bigint;
  share: bigint;
  net: bigint;
  status: BalanceStatus;
  entries: BalanceEntry[];
};

export type GroupBalance = {
  totalExpenses: bigint;
  members: MemberBalance[];
};

/** Thrown when stored expense/allocation data cannot produce a valid balance. */
export class BalanceCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BalanceCalculationError";
  }
}

/**
 * Calculates balances from group members and their recorded expenses.
 *
 * For every expense, the full amount is credited to the payer, and each
 * participant's allocated share is debited from that participant.
 */
export function calculateGroupBalances(
  members: readonly BalanceMember[],
  expenses: readonly BalanceExpense[],
): GroupBalance {
  if (!Array.isArray(members)) {
    throw new BalanceCalculationError("Members must be an array");
  }

  if (!Array.isArray(expenses)) {
    throw new BalanceCalculationError("Expenses must be an array");
  }

  const memberMap = new Map<string, BalanceMember>();
  const paidByUser = new Map<string, bigint>();
  const shareByUser = new Map<string, bigint>();
  const entriesByUser = new Map<string, BalanceEntry[]>();

  for (const member of members) {
    assertNonEmptyString(member.userId, "Member id");
    assertNonEmptyString(member.name, "Member name");

    if (memberMap.has(member.userId)) {
      throw new BalanceCalculationError(
        `Duplicate group member: "${member.userId}"`,
      );
    }

    memberMap.set(member.userId, member);
    paidByUser.set(member.userId, 0n);
    shareByUser.set(member.userId, 0n);
    entriesByUser.set(member.userId, []);
  }

  const seenExpenseIds = new Set<string>();
  let totalExpenses = 0n;

  for (const expense of expenses) {
    assertNonEmptyString(expense.id, "Expense id");

    if (seenExpenseIds.has(expense.id)) {
      throw new BalanceCalculationError(
        `Duplicate expense id: "${expense.id}"`,
      );
    }
    seenExpenseIds.add(expense.id);

    assertBigInt(expense.amount, `Expense "${expense.id}" amount`);

    if (expense.amount <= 0n) {
      throw new BalanceCalculationError(
        `Expense "${expense.id}" amount must be greater than zero`,
      );
    }

    if (!memberMap.has(expense.paidById)) {
      throw new BalanceCalculationError(
        `Expense "${expense.id}" has a payer who is not a group member`,
      );
    }

    if (
      !Array.isArray(expense.participants) ||
      expense.participants.length === 0
    ) {
      throw new BalanceCalculationError(
        `Expense "${expense.id}" must have at least one participant`,
      );
    }

    const participantShares = new Map<string, bigint>();
    let allocated = 0n;

    for (const participant of expense.participants) {
      assertNonEmptyString(participant.userId, "Participant id");

      if (!memberMap.has(participant.userId)) {
        throw new BalanceCalculationError(
          `Expense "${expense.id}" has a participant who is not a group member`,
        );
      }

      if (participantShares.has(participant.userId)) {
        throw new BalanceCalculationError(
          `Expense "${expense.id}" has a duplicate participant`,
        );
      }

      assertBigInt(
        participant.shareAmount,
        `Expense "${expense.id}" participant share`,
      );

      if (participant.shareAmount < 0n) {
        throw new BalanceCalculationError(
          `Expense "${expense.id}" has a negative participant share`,
        );
      }

      participantShares.set(participant.userId, participant.shareAmount);
      allocated += participant.shareAmount;
    }

    if (allocated !== expense.amount) {
      throw new BalanceCalculationError(
        `Expense "${expense.id}" allocations do not equal its total`,
      );
    }

    totalExpenses += expense.amount;

    const affectedUserIds = new Set<string>([
      expense.paidById,
      ...participantShares.keys(),
    ]);

    for (const userId of affectedUserIds) {
      const paid = userId === expense.paidById ? expense.amount : 0n;
      const share = participantShares.get(userId) ?? 0n;
      const effect = paid - share;

      paidByUser.set(userId, (paidByUser.get(userId) ?? 0n) + paid);
      shareByUser.set(userId, (shareByUser.get(userId) ?? 0n) + share);

      const entries = entriesByUser.get(userId);
      if (!entries) {
        throw new BalanceCalculationError(
          `Cannot record a balance entry for unknown member "${userId}"`,
        );
      }

      entries.push({
        expenseId: expense.id,
        description: expense.description,
        expenseDate: expense.expenseDate,
        paid,
        share,
        effect,
      });
    }
  }

  const balances: MemberBalance[] = members.map((member) => {
    const paid = paidByUser.get(member.userId) ?? 0n;
    const share = shareByUser.get(member.userId) ?? 0n;
    const net = paid - share;

    return {
      userId: member.userId,
      name: member.name,
      paid,
      share,
      net,
      status: net > 0n ? "owed" : net < 0n ? "owes" : "settled",
      entries: entriesByUser.get(member.userId) ?? [],
    };
  });

  const netTotal = balances.reduce((sum, balance) => sum + balance.net, 0n);

  if (netTotal !== 0n) {
    throw new BalanceCalculationError(
      "Group net balances do not add up to zero",
    );
  }

  return { totalExpenses, members: balances };
}

function assertBigInt(value: unknown, label: string): asserts value is bigint {
  if (typeof value !== "bigint") {
    throw new BalanceCalculationError(`${label} must be a bigint`);
  }
}

function assertNonEmptyString(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BalanceCalculationError(`${label} must be a non-empty string`);
  }
}
