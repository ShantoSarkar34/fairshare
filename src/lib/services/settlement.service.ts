import "server-only";

import {
  BalanceCalculationError,
  calculateGroupBalances,
} from "@/lib/calculations/balance";
import {
  calculateSettlements,
  SettlementCalculationError,
} from "@/lib/calculations/settlement";
import { acquireAdvisoryLock } from "@/lib/db/advisory-lock";
import { prisma } from "@/lib/db/prisma";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import {
  parseSignedMoneyToPoisha,
  poishaToDecimalString,
} from "@/lib/money";
import { recordActivity } from "@/lib/services/activity.service";
import { getGroupBalances } from "@/lib/services/balance.service";
import { requireMembership } from "@/lib/services/group-access";
import { loadGroupLedger } from "@/lib/services/ledger.service";
import { formatSettlementDateTime } from "@/lib/settlements/display";
import type {
  SettlementHistoryItem,
  SettlementOverviewResult,
} from "@/lib/settlements/types";
import type { RecordSettlementInput } from "@/lib/validations/settlement";

const INCONSISTENT_LEDGER_MESSAGE =
  "The settlement could not be checked because the group's ledger is inconsistent.";
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

export type RecordSettlementResult = {
  settlementId: string;
};

/**
 * Loads the current balances and settlement history for the group page.
 * Suggestions are derived from the same BigInt balances shown elsewhere.
 */
export async function getSettlementOverview(
  groupId: string,
): Promise<SettlementOverviewResult> {
  const balances = await getGroupBalances(groupId);

  if (!balances.ok) {
    return balances;
  }

  const membership = await requireMembership(
    groupId,
    balances.data.currentUserId,
  );

  const history = await prisma.settlement.findMany({
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
      createdById: true,
      fromUser: { select: { name: true } },
      toUser: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });

  const nameByUser = new Map(
    balances.data.members.map((member) => [member.userId, member.name]),
  );

  try {
    const suggestions = calculateSettlements(
      balances.data.members.map((member) => ({
        userId: member.userId,
        net: parseSignedMoneyToPoisha(member.net),
      })),
    ).map((transfer) => ({
      fromUserId: transfer.fromUserId,
      fromName: nameByUser.get(transfer.fromUserId) ?? transfer.fromUserId,
      toUserId: transfer.toUserId,
      toName: nameByUser.get(transfer.toUserId) ?? transfer.toUserId,
      amount: poishaToDecimalString(transfer.amount),
    }));

    const historyItems: SettlementHistoryItem[] = history.map((settlement) => ({
      id: settlement.id,
      fromUserId: settlement.fromUserId,
      fromName: settlement.fromUser.name,
      toUserId: settlement.toUserId,
      toName: settlement.toUser.name,
      amount: poishaToDecimalString(settlement.amount),
      method: settlement.method,
      transactionReference: settlement.transactionReference,
      note: settlement.note,
      recordedById: settlement.createdById,
      recordedByName: settlement.createdBy.name,
      settledAt: settlement.settledAt.toISOString(),
      settledAtLabel: formatSettlementDateTime(
        settlement.settledAt.toISOString(),
      ),
    }));

    return {
      ok: true,
      data: {
        currentUserId: balances.data.currentUserId,
        currentUserRole: membership.role,
        members: balances.data.members.map((member) => ({
          userId: member.userId,
          name: member.name,
          isActive: member.isActive,
          net: member.net,
        })),
        suggestions,
        history: historyItems,
      },
    };
  } catch (error) {
    if (error instanceof SettlementCalculationError) {
      console.error(
        `Settlement suggestion calculation failed for group "${groupId}":`,
        error.message,
      );
      return {
        ok: false,
        error: "Settlements could not be calculated from the current balances.",
      };
    }

    throw error;
  }
}

/**
 * Records a manual member-to-member payment after rechecking every rule inside
 * a group-level advisory lock. The lock serializes concurrent settlement
 * attempts for the same group, so two requests cannot both spend the same
 * outstanding debt.
 */
export async function recordSettlement(
  groupId: string,
  actorId: string,
  input: RecordSettlementInput,
): Promise<RecordSettlementResult> {
  if (input.amount <= 0n) {
    throw new ValidationError("Amount must be greater than zero");
  }

  if (input.amount > MAX_POSTGRES_BIGINT) {
    throw new ValidationError("Amount is too large");
  }

  if (input.fromUserId === input.toUserId) {
    throw new ValidationError("Sender and receiver must be different people");
  }

  const actorMembership = await requireMembership(groupId, actorId);

  const parties = await prisma.groupMember.findMany({
    where: {
      groupId,
      userId: { in: [input.fromUserId, input.toUserId] },
    },
    select: { userId: true },
  });
  const partyIds = new Set(parties.map((party) => party.userId));

  if (!partyIds.has(input.fromUserId)) {
    throw new ValidationError("Sender is not a member of this group");
  }

  if (!partyIds.has(input.toUserId)) {
    throw new ValidationError("Receiver is not a member of this group");
  }

  const canRecord =
    actorId === input.fromUserId ||
    actorId === input.toUserId ||
    actorMembership.role === "ADMIN";

  if (!canRecord) {
    throw new ForbiddenError(
      "Only the sender, receiver, or a group admin can record this payment",
    );
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        // The advisory lock is scoped to this group and released when the
        // transaction finishes. Recalculation happens after acquiring it.
        await acquireAdvisoryLock(tx, groupId);

        const currentActor = await tx.groupMember.findFirst({
          where: { groupId, userId: actorId, leftAt: null },
          select: { role: true },
        });

        if (!currentActor) {
          throw new NotFoundError("Group not found");
        }

        const stillAuthorized =
          actorId === input.fromUserId ||
          actorId === input.toUserId ||
          currentActor.role === "ADMIN";

        if (!stillAuthorized) {
          throw new ForbiddenError(
            "Only the sender, receiver, or a group admin can record this payment",
          );
        }

        const ledger = await loadGroupLedger(tx, groupId);
        const balances = calculateGroupBalances(
          ledger.members,
          ledger.expenses,
          ledger.settlements,
        );
        const fromBalance = balances.members.find(
          (member) => member.userId === input.fromUserId,
        );
        const toBalance = balances.members.find(
          (member) => member.userId === input.toUserId,
        );

        if (!fromBalance || !toBalance) {
          throw new ValidationError(
            "Sender and receiver must both be members of this group",
          );
        }

        const outstandingDebt =
          fromBalance.net < 0n ? 0n - fromBalance.net : 0n;
        const outstandingCredit = toBalance.net > 0n ? toBalance.net : 0n;

        if (outstandingDebt === 0n) {
          throw new ValidationError(
            "Sender does not have an outstanding debt in this group",
          );
        }

        if (outstandingCredit === 0n) {
          throw new ValidationError(
            "Receiver does not have an outstanding credit in this group",
          );
        }

        if (input.amount > outstandingDebt) {
          throw new ValidationError(
            "Payment exceeds the sender's outstanding debt",
          );
        }

        if (input.amount > outstandingCredit) {
          throw new ValidationError(
            "Payment exceeds the receiver's outstanding credit",
          );
        }

        const settlement = await tx.settlement.create({
          data: {
            groupId,
            fromUserId: input.fromUserId,
            toUserId: input.toUserId,
            amount: input.amount,
            method: input.method,
            transactionReference: input.transactionReference ?? null,
            note: input.note ?? null,
            createdById: actorId,
            settledAt: new Date(),
          },
          select: { id: true },
        });

        await recordActivity(tx, {
          groupId,
          actorId,
          action: "SETTLEMENT_RECORDED",
          entityType: "settlement",
          entityId: settlement.id,
          metadata: {
            settlementId: settlement.id,
            fromUserId: input.fromUserId,
            fromName: fromBalance.name,
            toUserId: input.toUserId,
            toName: toBalance.name,
            // JSON cannot store BigInt; use the same decimal wire format as
            // the balance and settlement views.
            amount: poishaToDecimalString(input.amount),
            method: input.method,
            transactionReference: input.transactionReference ?? null,
          },
        });

        return { settlementId: settlement.id };
      },
      { maxWait: 5_000, timeout: 15_000 },
    );
  } catch (error) {
    if (error instanceof BalanceCalculationError) {
      console.error(
        `Settlement rejected for group "${groupId}":`,
        error.message,
      );
      throw new ConflictError(INCONSISTENT_LEDGER_MESSAGE);
    }

    throw error;
  }
}
