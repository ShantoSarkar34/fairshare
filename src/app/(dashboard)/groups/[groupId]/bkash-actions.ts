"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, toFailure, type ActionResult } from "@/lib/actions/result";
import { requireUser } from "@/lib/auth/session";
import type {
  BkashCheckoutSession,
  BkashPaymentView,
} from "@/lib/bkash/types";
import {
  checkBkashPaymentStatus,
  createBkashCheckout,
} from "@/lib/services/bkash-payment.service";
import { bkashAmountSchema } from "@/lib/validations/bkash";
import { idSchema } from "@/lib/validations/common";

export async function createBkashCheckoutAction(
  groupId: unknown,
  amount: unknown,
): Promise<ActionResult<BkashCheckoutSession>> {
  const user = await requireUser();
  const parsedGroupId = idSchema.safeParse(groupId);

  if (!parsedGroupId.success) {
    return fail("Invalid group");
  }

  const parsedAmount = bkashAmountSchema.safeParse(amount);

  if (!parsedAmount.success) {
    return fail("Please enter a valid amount", {
      amount: parsedAmount.error.issues.map((issue) => issue.message),
    });
  }

  try {
    const checkout = await createBkashCheckout(
      parsedGroupId.data,
      user.id,
      parsedAmount.data,
    );

    revalidatePath(`/groups/${parsedGroupId.data}`);

    return ok(checkout);
  } catch (error) {
    return toFailure(error);
  }
}

export async function checkBkashPaymentStatusAction(
  groupId: unknown,
  paymentId: unknown,
): Promise<ActionResult<{ payment: BkashPaymentView }>> {
  const user = await requireUser();
  const parsedGroupId = idSchema.safeParse(groupId);
  const parsedPaymentId = idSchema.safeParse(paymentId);

  if (!parsedGroupId.success || !parsedPaymentId.success) {
    return fail("Invalid payment");
  }

  try {
    const payment = await checkBkashPaymentStatus(
      parsedGroupId.data,
      user.id,
      parsedPaymentId.data,
    );

    revalidatePath(`/groups/${parsedGroupId.data}`);

    return ok({ payment });
  } catch (error) {
    return toFailure(error);
  }
}
