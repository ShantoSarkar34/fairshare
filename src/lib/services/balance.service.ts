import "server-only";

import { requireUser } from "@/lib/auth/session";
import type { GroupBalanceResult } from "@/lib/balances/types";
import {
  BalanceCalculationError,
  calculateGroupBalances,
} from "@/lib/calculations/balance";
import { prisma } from "@/lib/db/prisma";
import { poishaToDecimalString } from "@/lib/money";
import { requireMembership } from "@/lib/services/group-access";
import { loadGroupLedger } from "@/lib/services/ledger.service";
import { formatSettlementDateTime } from "@/lib/settlements/display";

const INCONSISTENT_DATA_MESSAGE =
  "Balances could not be calculated because the group's ledger is inconsistent.";

/**
 * Loads only this group's members, expenses and settlements, then calculates
 * balances with the pure BigInt calculator.
 *
 * The current user must be an active member. Inaccessible groups behave like
 * missing groups through requireMembership().
 */
export async function getGroupBalances(
  groupId: string,
): Promise<GroupBalanceResult> {
  const user = await requireUser();
  await requireMembership(groupId, user.id);

  const ledger = await loadGroupLedger(prisma, groupId);

  try {
    const result = calculateGroupBalances(
      ledger.members,
      ledger.expenses,
      ledger.settlements,
    );
    const membershipByUser = new Map(
      ledger.memberships.map((membership) => [membership.userId, membership]),
    );
    const nameByUser = new Map(
      ledger.members.map((member) => [member.userId, member.name]),
    );

    return {
      ok: true,
      data: {
        totalExpenses: poishaToDecimalString(result.totalExpenses),
        currentUserId: user.id,
        members: result.members
          // Keep every active member, plus former members who left a balance
          // trail. Former members with no expense/settlement activity are not
          // useful here.
          .filter((member) => {
            const membership = membershipByUser.get(member.userId);
            return (
              membership?.isActive === true ||
              member.entries.length > 0 ||
              member.settlementEntries.length > 0
            );
          })
          .map((member) => {
            const membership = membershipByUser.get(member.userId);

            return {
              userId: member.userId,
              name: member.name,
              isActive: membership?.isActive ?? false,
              paid: poishaToDecimalString(member.paid),
              share: poishaToDecimalString(member.share),
              settlementsSent: poishaToDecimalString(member.settlementsSent),
              settlementsReceived: poishaToDecimalString(
                member.settlementsReceived,
              ),
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
              settlementEntries: member.settlementEntries.map((entry) => ({
                settlementId: entry.settlementId,
                fromUserId: entry.fromUserId,
                fromName:
                  nameByUser.get(entry.fromUserId) ?? entry.fromUserId,
                toUserId: entry.toUserId,
                toName: nameByUser.get(entry.toUserId) ?? entry.toUserId,
                amount: poishaToDecimalString(entry.amount),
                settledAt: entry.settledAt,
                settledAtLabel: entry.settledAt
                  ? formatSettlementDateTime(entry.settledAt)
                  : undefined,
                method: entry.method,
                note: entry.note,
                transactionReference: entry.transactionReference,
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
