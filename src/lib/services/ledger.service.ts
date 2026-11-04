import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type {
  BalanceExpense,
  BalanceMember,
  BalanceSettlement,
} from "@/lib/calculations/balance";

/**
 * The transaction client and the normal client expose the same delegates we
 * need. Picking only these keeps this helper usable inside interactive
 * transactions and in read-only server components.
 */
export type LedgerClient = Pick<
  Prisma.TransactionClient,
  "groupMember" | "expense" | "settlement"
>;

export type LedgerMembership = {
  userId: string;
  name: string;
  isActive: boolean;
  joinedAt: Date;
  leftAt: Date | null;
};

export type GroupLedger = {
  memberships: LedgerMembership[];
  members: BalanceMember[];
  expenses: BalanceExpense[];
  settlements: BalanceSettlement[];
};

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Loads all members, expenses and settlements for exactly one group.
 * The caller is responsible for authorization before calling this helper.
 */
export async function loadGroupLedger(
  client: LedgerClient,
  groupId: string,
): Promise<GroupLedger> {
  const [rawMemberships, expenses, settlements] = await Promise.all([
    client.groupMember.findMany({
      where: { groupId },
      orderBy: { joinedAt: "asc" },
      select: {
        userId: true,
        leftAt: true,
        joinedAt: true,
        user: { select: { name: true } },
      },
    }),
    client.expense.findMany({
      where: { groupId },
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        description: true,
        amount: true,
        expenseDate: true,
        paidById: true,
        participants: {
          select: { userId: true, shareAmount: true },
        },
      },
    }),
    client.settlement.findMany({
      where: { groupId },
      orderBy: [{ settledAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        fromUserId: true,
        toUserId: true,
        amount: true,
        method: true,
        transactionReference: true,
        note: true,
        settledAt: true,
      },
    }),
  ]);

  const memberships: LedgerMembership[] = [...rawMemberships]
    .sort((a, b) => {
      const activeA = a.leftAt === null ? 0 : 1;
      const activeB = b.leftAt === null ? 0 : 1;

      if (activeA !== activeB) return activeA - activeB;

      return a.joinedAt.getTime() - b.joinedAt.getTime();
    })
    .map((membership) => ({
      userId: membership.userId,
      name: membership.user.name,
      isActive: membership.leftAt === null,
      joinedAt: membership.joinedAt,
      leftAt: membership.leftAt,
    }));

  return {
    memberships,
    members: memberships.map((membership) => ({
      userId: membership.userId,
      name: membership.name,
    })),
    expenses: expenses.map((expense) => ({
      id: expense.id,
      description: expense.description,
      amount: expense.amount,
      paidById: expense.paidById,
      expenseDate: toDateOnly(expense.expenseDate),
      participants: expense.participants.map((participant) => ({
        userId: participant.userId,
        shareAmount: participant.shareAmount,
      })),
    })),
    settlements: settlements.map((settlement) => ({
      id: settlement.id,
      fromUserId: settlement.fromUserId,
      toUserId: settlement.toUserId,
      amount: settlement.amount,
      method: settlement.method,
      transactionReference: settlement.transactionReference ?? undefined,
      note: settlement.note ?? undefined,
      settledAt: settlement.settledAt.toISOString(),
    })),
  };
}
