"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, toFailure, type ActionResult } from "@/lib/actions/result";
import { requireUser } from "@/lib/auth/session";
import { recordSettlement } from "@/lib/services/settlement.service";
import { idSchema } from "@/lib/validations/common";
import { recordSettlementSchema } from "@/lib/validations/settlement";

export async function recordSettlementAction(
  groupId: unknown,
  input: unknown,
): Promise<ActionResult<{ settlementId: string }>> {
  const user = await requireUser();
  const parsedGroupId = idSchema.safeParse(groupId);

  if (!parsedGroupId.success) {
    return fail("Invalid group");
  }

  const parsedInput = recordSettlementSchema.safeParse(input);

  if (!parsedInput.success) {
    return fail("Please fix the highlighted fields", parsedInput.error.flatten().fieldErrors);
  }

  try {
    const result = await recordSettlement(
      parsedGroupId.data,
      user.id,
      parsedInput.data,
    );

    revalidatePath(`/groups/${parsedGroupId.data}`);

    return ok(result);
  } catch (error) {
    return toFailure(error);
  }
}
