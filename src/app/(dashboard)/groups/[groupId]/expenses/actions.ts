"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, toFailure, type ActionResult } from "@/lib/actions/result";
import { requireUser } from "@/lib/auth/session";
import {
  createExpense,
  deleteExpense,
  updateExpense,
} from "@/lib/services/expense.service";
import { idSchema } from "@/lib/validations/common";
import { createExpenseSchema } from "@/lib/validations/expense";

function revalidateExpensePaths(groupId: string, expenseId?: string): void {
  revalidatePath(`/groups/${groupId}`);
  revalidatePath(`/groups/${groupId}/expenses`);

  if (expenseId) {
    revalidatePath(`/groups/${groupId}/expenses/${expenseId}`);
  }
}

export async function createExpenseAction(
  groupId: unknown,
  input: unknown,
): Promise<ActionResult<{ expenseId: string }>> {
  // Identity comes from the session, never from client input.
  const user = await requireUser();

  const parsedGroupId = idSchema.safeParse(groupId);
  if (!parsedGroupId.success) return fail("Invalid group.");

  const parsed = createExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      "Please fix the highlighted fields.",
      z.flattenError(parsed.error).fieldErrors,
    );
  }

  try {
    const expense = await createExpense(
      parsedGroupId.data,
      user.id,
      parsed.data,
    );
    revalidateExpensePaths(parsedGroupId.data);
    return ok({ expenseId: expense.id });
  } catch (error) {
    return toFailure(error);
  }
}

export async function updateExpenseAction(
  groupId: unknown,
  expenseId: unknown,
  input: unknown,
): Promise<ActionResult<{ expenseId: string }>> {
  const user = await requireUser();

  const parsedGroupId = idSchema.safeParse(groupId);
  const parsedExpenseId = idSchema.safeParse(expenseId);

  if (!parsedGroupId.success || !parsedExpenseId.success) {
    return fail("Invalid expense.");
  }

  const parsed = createExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      "Please fix the highlighted fields.",
      z.flattenError(parsed.error).fieldErrors,
    );
  }

  try {
    const expense = await updateExpense(
      parsedGroupId.data,
      user.id,
      parsedExpenseId.data,
      parsed.data,
    );
    revalidateExpensePaths(parsedGroupId.data, parsedExpenseId.data);
    return ok({ expenseId: expense.id });
  } catch (error) {
    return toFailure(error);
  }
}

export async function deleteExpenseAction(
  groupId: unknown,
  expenseId: unknown,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsedGroupId = idSchema.safeParse(groupId);
  const parsedExpenseId = idSchema.safeParse(expenseId);

  if (!parsedGroupId.success || !parsedExpenseId.success) {
    return fail("Invalid expense.");
  }

  try {
    await deleteExpense(
      parsedGroupId.data,
      user.id,
      parsedExpenseId.data,
    );
    revalidateExpensePaths(parsedGroupId.data);
    return ok(null);
  } catch (error) {
    return toFailure(error);
  }
}
