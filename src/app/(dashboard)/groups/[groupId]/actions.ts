"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, toFailure, type ActionResult } from "@/lib/actions/result";
import { requireUser } from "@/lib/auth/session";
import { createInvite, revokeInvites } from "@/lib/services/invite.service";
import { idSchema } from "@/lib/validations/common";

export async function createInviteAction(
  groupId: unknown,
): Promise<ActionResult<{ token: string; expiresAt: string }>> {
  // requireUser() redirects by throwing, so it stays outside the try/catch.
  const user = await requireUser();

  const parsed = idSchema.safeParse(groupId);
  if (!parsed.success) return fail("Invalid group.");

  try {
    // The service checks that this user is an ADMIN of THIS group.
    const { token, expiresAt } = await createInvite(parsed.data, user.id);
    revalidatePath(`/groups/${parsed.data}`);
    return ok({ token, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    return toFailure(error);
  }
}

export async function revokeInvitesAction(
  groupId: unknown,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = idSchema.safeParse(groupId);
  if (!parsed.success) return fail("Invalid group.");

  try {
    await revokeInvites(parsed.data, user.id);
    revalidatePath(`/groups/${parsed.data}`);
    return ok(null);
  } catch (error) {
    return toFailure(error);
  }
}
