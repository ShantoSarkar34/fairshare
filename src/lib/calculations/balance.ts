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

export type BalanceSettlement = {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: bigint;
  /** Optional display metadata; it does not affect the arithmetic. */
  settledAt?: string;
  method?: string;
  note?: string;
  transactionReference?: string;
};

export type BalanceEntry = {
  expenseId: string;
  description: string;
  expenseDate?: string;
  paid: bigint;
  share: bigint;
  effect: bigint;
};

export type BalanceSettlementEntry = {
  settlementId: string;
  fromUserId: string;
  toUserId: string;
  amount: bigint;
  settledAt?: string;
  method?: string;
  note?: string;
  transactionReference?: string;
  /** Effect on this member's balance: positive when they sent the payment. */
  effect: bigint;
};

export type MemberBalance = {
  userId: string;
  name: string;
  paid: bigint;
  share: bigint;
  settlementsSent: bigint;
  settlementsReceived: bigint;
  net: bigint;
  status: BalanceStatus;
  entries: BalanceEntry[];
  settlementEntries: BalanceSettlementEntry[];
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
  settlements: readonly BalanceSettlement[] = [],
): GroupBalance {
  if (!Array.isArray(members)) {
    throw new BalanceCalculationError("Members must be an array");
  }

  if (!Array.isArray(expenses)) {
    throw new BalanceCalculationError("Expenses must be an array");
  }

  if (!Array.isArray(settlements)) {
    throw new BalanceCalculationError("Settlements must be an array");
  }

  const memberMap = new Map<string, BalanceMember>();
  const paidByUser = new Map<string, bigint>();
  const shareByUser = new Map<string, bigint>();
  const sentByUser = new Map<string, bigint>();
  const receivedByUser = new Map<string, bigint>();
  const entriesByUser = new Map<string, BalanceEntry[]>();
  const settlementEntriesByUser = new Map<string, BalanceSettlementEntry[]>();

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
    sentByUser.set(member.userId, 0n);
    receivedByUser.set(member.userId, 0n);
    entriesByUser.set(member.userId, []);
    settlementEntriesByUser.set(member.userId, []);
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

  const seenSettlementIds = new Set<string>();

  for (const settlement of settlements) {
    assertNonEmptyString(settlement.id, "Settlement id");

    if (seenSettlementIds.has(settlement.id)) {
      throw new BalanceCalculationError(
        `Duplicate settlement id: "${settlement.id}"`,
      );
    }
    seenSettlementIds.add(settlement.id);

    assertBigInt(settlement.amount, `Settlement "${settlement.id}" amount`);

    if (settlement.amount <= 0n) {
      throw new BalanceCalculationError(
        `Settlement "${settlement.id}" amount must be greater than zero`,
      );
    }

    if (!memberMap.has(settlement.fromUserId)) {
      throw new BalanceCalculationError(
        `Settlement "${settlement.id}" has a sender who is not a group member`,
      );
    }

    if (!memberMap.has(settlement.toUserId)) {
      throw new BalanceCalculationError(
        `Settlement "${settlement.id}" has a receiver who is not a group member`,
      );
    }

    if (settlement.fromUserId === settlement.toUserId) {
      throw new BalanceCalculationError(
        `Settlement "${settlement.id}" must have two different members`,
      );
    }

    sentByUser.set(
      settlement.fromUserId,
      (sentByUser.get(settlement.fromUserId) ?? 0n) + settlement.amount,
    );
    receivedByUser.set(
      settlement.toUserId,
      (receivedByUser.get(settlement.toUserId) ?? 0n) + settlement.amount,
    );

    const senderEntries = settlementEntriesByUser.get(settlement.fromUserId);
    const receiverEntries = settlementEntriesByUser.get(settlement.toUserId);

    if (!senderEntries || !receiverEntries) {
      throw new BalanceCalculationError(
        `Cannot record settlement "${settlement.id}" for an unknown member`,
      );
    }

    const baseEntry = {
      settlementId: settlement.id,
      fromUserId: settlement.fromUserId,
      toUserId: settlement.toUserId,
      amount: settlement.amount,
      settledAt: settlement.settledAt,
      method: settlement.method,
      note: settlement.note,
      transactionReference: settlement.transactionReference,
    };

    senderEntries.push({ ...baseEntry, effect: settlement.amount });
    receiverEntries.push({ ...baseEntry, effect: 0n - settlement.amount });
  }

  const balances: MemberBalance[] = members.map((member) => {
    const paid = paidByUser.get(member.userId) ?? 0n;
    const share = shareByUser.get(member.userId) ?? 0n;
    const settlementsSent = sentByUser.get(member.userId) ?? 0n;
    const settlementsReceived = receivedByUser.get(member.userId) ?? 0n;
    const net = paid - share + settlementsSent - settlementsReceived;

    return {
      userId: member.userId,
      name: member.name,
      paid,
      share,
      settlementsSent,
      settlementsReceived,
      net,
      status: net > 0n ? "owed" : net < 0n ? "owes" : "settled",
      entries: entriesByUser.get(member.userId) ?? [],
      settlementEntries: settlementEntriesByUser.get(member.userId) ?? [],
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
