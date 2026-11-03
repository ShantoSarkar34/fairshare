import "server-only";

import { prisma } from "@/lib/db/prisma";
import type {
  ExpenseDetail,
  ExpenseListItem,
  ExpenseSplitType,
} from "@/lib/expenses/types";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { poishaToDecimalString, sumPoisha } from "@/lib/money";
import { requireMembership } from "@/lib/services/group-access";
import {
  splitEqual,
  splitExact,
  splitPercentage,
  splitShares,
  type SplitAllocation,
} from "@/lib/split";
import type { CreateExpenseInput } from "@/lib/validations/expense";

const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;
const MAX_POSTGRES_INT = 2_147_483_647;

type ParticipantCreate = {
  userId: string;
  shareAmount: bigint;
  splitValue: number | null;
};

/**
 * Reuses Phase 9's split functions. Any validation error from a split function
 * becomes an AppError so the action can return a safe message to the user.
 */
function buildParticipantCreates(
  input: CreateExpenseInput,
): ParticipantCreate[] {
  try {
    if (input.amount > MAX_POSTGRES_BIGINT) {
      throw new ValidationError("Total amount is too large");
    }

    const splitValues = new Map<string, number>();

    if (input.splitType === "PERCENTAGE") {
      for (const participant of input.participants) {
        splitValues.set(participant.userId, participant.basisPoints);
      }
    }

    if (input.splitType === "SHARES") {
      for (const participant of input.participants) {
        if (participant.shares > MAX_POSTGRES_INT) {
          throw new ValidationError("Shares value is too large");
        }

        splitValues.set(participant.userId, participant.shares);
      }
    }

    let allocations: SplitAllocation[];

    switch (input.splitType) {
      case "EQUAL":
        allocations = splitEqual(
          input.amount,
          input.participants.map((participant) => participant.userId),
        );
        break;
      case "EXACT":
        allocations = splitExact(
          input.amount,
          input.participants.map((participant) => ({
            userId: participant.userId,
            amount: participant.amount,
          })),
        );
        break;
      case "PERCENTAGE":
        allocations = splitPercentage(
          input.amount,
          input.participants.map((participant) => ({
            userId: participant.userId,
            basisPoints: participant.basisPoints,
          })),
        );
        break;
      case "SHARES":
        allocations = splitShares(
          input.amount,
          input.participants.map((participant) => ({
            userId: participant.userId,
            shares: participant.shares,
          })),
        );
        break;
    }

    const allocated = sumPoisha(
      allocations.map((allocation) => allocation.amount),
    );

    if (allocated !== input.amount) {
      throw new ValidationError("Allocations do not add up to the total amount");
    }

    return allocations.map((allocation) => ({
      userId: allocation.userId,
      shareAmount: allocation.amount,
      splitValue: splitValues.get(allocation.userId) ?? null,
    }));
  } catch (error) {
    if (error instanceof RangeError || error instanceof TypeError) {
      throw new ValidationError(error.message);
    }
    throw error;
  }
}

/**
 * Payer and participants must all be ACTIVE members of this exact group.
 * A member id from another group therefore fails here even if the caller knows it.
 */
async function assertActiveGroupMembers(
  groupId: string,
  userIds: readonly string[],
): Promise<void> {
  const uniqueUserIds = [...new Set(userIds)];

  const members = await prisma.groupMember.findMany({
    where: {
      groupId,
      userId: { in: uniqueUserIds },
      leftAt: null,
    },
    select: { userId: true },
  });

  if (members.length !== uniqueUserIds.length) {
    throw new ValidationError(
      "The payer and all participants must be active members of this group",
    );
  }
}

function canManageExpense(
  actorId: string,
  createdById: string,
  role: "ADMIN" | "MEMBER",
): boolean {
  return actorId === createdById || role === "ADMIN";
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Creates an expense and all participant allocations atomically. */
export async function createExpense(
  groupId: string,
  actorId: string,
  input: CreateExpenseInput,
) {
  await requireMembership(groupId, actorId);

  await assertActiveGroupMembers(groupId, [
    input.paidById,
    ...input.participants.map((participant) => participant.userId),
  ]);

  const participants = buildParticipantCreates(input);

  return prisma.expense.create({
    data: {
      groupId,
      description: input.description,
      amount: input.amount,
      expenseDate: input.expenseDate,
      paidById: input.paidById,
      // The creator always comes from the session, never from client input.
      createdById: actorId,
      splitType: input.splitType,
      participants: { create: participants },
    },
    select: { id: true },
  });
}

/**
 * Updates fields and replaces all allocations in one transaction.
 * Only the creator or a group ADMIN may edit an expense.
 */
export async function updateExpense(
  groupId: string,
  actorId: string,
  expenseId: string,
  input: CreateExpenseInput,
) {
  const membership = await requireMembership(groupId, actorId);

  const existing = await prisma.expense.findFirst({
    where: { id: expenseId, groupId },
    select: { id: true, createdById: true },
  });

  if (!existing) {
    throw new NotFoundError("Expense not found");
  }

  if (!canManageExpense(actorId, existing.createdById, membership.role)) {
    throw new ForbiddenError(
      "Only the expense creator or a group admin can edit this expense",
    );
  }

  await assertActiveGroupMembers(groupId, [
    input.paidById,
    ...input.participants.map((participant) => participant.userId),
  ]);

  const participants = buildParticipantCreates(input);

  await prisma.$transaction(async (tx) => {
    await tx.expense.update({
      where: { id: existing.id },
      data: {
        description: input.description,
        amount: input.amount,
        expenseDate: input.expenseDate,
        paidById: input.paidById,
        splitType: input.splitType,
      },
    });

    await tx.expenseParticipant.deleteMany({
      where: { expenseId: existing.id },
    });

    await tx.expenseParticipant.createMany({
      data: participants.map((participant) => ({
        expenseId: existing.id,
        ...participant,
      })),
    });
  });

  return { id: existing.id };
}

/**
 * Deletes an expense belonging to the given group, after verifying the actor
 * is the creator or an ADMIN. Participants are removed by the FK cascade.
 */
export async function deleteExpense(
  groupId: string,
  actorId: string,
  expenseId: string,
): Promise<void> {
  const membership = await requireMembership(groupId, actorId);

  const existing = await prisma.expense.findFirst({
    where: { id: expenseId, groupId },
    select: { id: true, createdById: true },
  });

  if (!existing) {
    throw new NotFoundError("Expense not found");
  }

  if (!canManageExpense(actorId, existing.createdById, membership.role)) {
    throw new ForbiddenError(
      "Only the expense creator or a group admin can delete this expense",
    );
  }

  await prisma.expense.delete({ where: { id: existing.id } });
}

/** Lists expenses newest first. Non-members receive a 404-like error. */
export async function listExpensesForGroup(
  groupId: string,
  userId: string,
): Promise<ExpenseListItem[]> {
  const membership = await requireMembership(groupId, userId);

  const expenses = await prisma.expense.findMany({
    where: { groupId },
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      description: true,
      amount: true,
      expenseDate: true,
      splitType: true,
      createdById: true,
      paidBy: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      participants: {
        orderBy: { userId: "asc" },
        select: {
          userId: true,
          user: { select: { name: true } },
        },
      },
    },
  });

  return expenses.map((expense) => ({
    id: expense.id,
    description: expense.description,
    amount: poishaToDecimalString(expense.amount),
    expenseDate: toDateOnly(expense.expenseDate),
    splitType: expense.splitType as ExpenseSplitType,
    paidBy: expense.paidBy,
    createdBy: expense.createdBy,
    participants: expense.participants.map((participant) => ({
      userId: participant.userId,
      name: participant.user.name,
    })),
    canManage: canManageExpense(
      userId,
      expense.createdById,
      membership.role,
    ),
  }));
}

/**
 * Returns one expense only when it belongs to this group AND the caller is an
 * active member. Another group's expense id therefore produces a 404.
 */
export async function getExpenseForMember(
  groupId: string,
  expenseId: string,
  userId: string,
): Promise<ExpenseDetail> {
  const membership = await requireMembership(groupId, userId);

  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, groupId },
    select: {
      id: true,
      groupId: true,
      description: true,
      amount: true,
      expenseDate: true,
      splitType: true,
      createdAt: true,
      updatedAt: true,
      createdById: true,
      group: { select: { name: true } },
      paidBy: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      participants: {
        orderBy: { userId: "asc" },
        select: {
          userId: true,
          shareAmount: true,
          splitValue: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
  });

  if (!expense) {
    throw new NotFoundError("Expense not found");
  }

  return {
    id: expense.id,
    groupId: expense.groupId,
    groupName: expense.group.name,
    description: expense.description,
    amount: poishaToDecimalString(expense.amount),
    expenseDate: toDateOnly(expense.expenseDate),
    splitType: expense.splitType as ExpenseSplitType,
    paidBy: expense.paidBy,
    createdBy: expense.createdBy,
    participants: expense.participants.map((participant) => ({
      userId: participant.userId,
      name: participant.user.name,
      email: participant.user.email,
      shareAmount: poishaToDecimalString(participant.shareAmount),
      splitValue: participant.splitValue,
    })),
    canManage: canManageExpense(userId, expense.createdById, membership.role),
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
  };
}
