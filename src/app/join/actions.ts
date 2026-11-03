"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, toFailure, type ActionResult } from "@/lib/actions/result";
import { requireUser } from "@/lib/auth/session";
import { acceptInvite } from "@/lib/services/invite.service";
import { inviteTokenSchema } from "@/lib/validations/invite";

export async function joinGroupAction(
  token: unknown
): Promise<ActionResult<{ groupId: string }>> {
  const user = await requireUser();

  const parsed = inviteTokenSchema.safeParse(token);
  if (!parsed.success) {
    return fail("This invite link is invalid or has expired.");
  }

  try {
    const { groupId } = await acceptInvite(parsed.data, user.id);
    revalidatePath("/groups");
    return ok({ groupId });
  } catch (error) {
    return toFailure(error);
  }
}