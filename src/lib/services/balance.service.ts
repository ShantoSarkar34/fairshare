import "server-only";

import { requireUser } from "@/lib/auth/session";
import type { GroupBalanceResult } from "@/lib/balances/types";
import {
  BalanceCalculationError,
  calculateGroupBalances,
  type BalanceExpense,
  type BalanceMember,
} from "@/lib/calculations/balance";
import { prisma } from "@/lib/db/prisma";
import { poishaToDecimalString } from "@/lib/money";
import { requireMembership } from "@/lib/services/group-access";

const INCONSISTENT_DATA_MESSAGE =
  "Balances could not be calculated because the group's expense data is inconsistent.";

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Loads only this group's members and expenses, then calculates balances with
 * the pure BigInt calculator.
 *
 * The current user must be an active member. Inaccessible groups behave like
 * missing groups through requireMembership().
 */
export async function getGroupBalances(
  groupId: string,
): Promise<GroupBalanceResult> {
  const user = await requireUser();
  await requireMembership(groupId, user.id);

  const [memberships, expenses] = await Promise.all([
    prisma.groupMember.findMany({
      where: { groupId },
      orderBy: { joinedAt: "asc" },
      select: {
        userId: true,
        leftAt: true,
        joinedAt: true,
        user: { select: { name: true } },
      },
    }),
    prisma.expense.findMany({
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
  ]);

  const orderedMemberships = [...memberships].sort((a, b) => {
    const activeA = a.leftAt === null ? 0 : 1;
    const activeB = b.leftAt === null ? 0 : 1;

    if (activeA !== activeB) return activeA - activeB;

    return a.joinedAt.getTime() - b.joinedAt.getTime();
  });

  const memberInputs: BalanceMember[] = orderedMemberships.map((membership) => ({
    userId: membership.userId,
    name: membership.user.name,
  }));

  const expenseInputs: BalanceExpense[] = expenses.map((expense) => ({
    id: expense.id,
    description: expense.description,
    amount: expense.amount,
    paidById: expense.paidById,
    expenseDate: toDateOnly(expense.expenseDate),
    participants: expense.participants.map((participant) => ({
      userId: participant.userId,
      shareAmount: participant.shareAmount,
    })),
  }));

  try {
    const result = calculateGroupBalances(memberInputs, expenseInputs);
    const membershipByUser = new Map(
      orderedMemberships.map((membership) => [membership.userId, membership]),
    );

    return {
      ok: true,
      data: {
        totalExpenses: poishaToDecimalString(result.totalExpenses),
        currentUserId: user.id,
        members: result.members
          // Keep every active member, plus former members who left a balance
          // trail. Former members with no expense activity are not useful here.
          .filter((member) => {
            const membership = membershipByUser.get(member.userId);
            return membership?.leftAt === null || member.entries.length > 0;
          })
          .map((member) => {
            const membership = membershipByUser.get(member.userId);

            return {
              userId: member.userId,
              name: member.name,
              isActive: membership?.leftAt === null,
              paid: poishaToDecimalString(member.paid),
              share: poishaToDecimalString(member.share),
              net: poishaToDecimalString(member.net),
              status: member.status,
              entries: member.entries.map((entry) => ({
                expenseId: entry.expenseId,
                description: entry.description,
                expenseDate: entry.expenseDate,
                paid: poishaToDecimalString(entry.paid),
                share: poishaToDecimalString(entry.share),
                effect: poishaToDecimalString(entry.effect),
              })),
            };
          }),
      },
    };
  } catch (error) {
    if (error instanceof BalanceCalculationError) {
      // Stored data is inconsistent. Log the details for operators, but do
      // not expose internal ids or amounts to the browser.
      console.error(
        `Balance calculation failed for group "${groupId}":`,
        error.message,
      );
      return { ok: false, error: INCONSISTENT_DATA_MESSAGE };
    }

    throw error;
  }
}
