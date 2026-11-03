"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, toFailure, type ActionResult } from "@/lib/actions/result";
import { requireUser } from "@/lib/auth/session";
import { deleteGroup, removeMember } from "@/lib/services/group.service";
import { createInvite, revokeInvites } from "@/lib/services/invite.service";
import { idSchema } from "@/lib/validations/common";
import { deleteGroupSchema, removeMemberSchema } from "@/lib/validations/group";

// Reminder: requireUser() redirects by throwing, so it always stays OUTSIDE
// the try/catch blocks. Identity always comes from the session.

export async function createInviteAction(
  groupId: unknown,
): Promise<ActionResult<{ token: string; expiresAt: string }>> {
  const user = await requireUser();

  const parsed = idSchema.safeParse(groupId);
  if (!parsed.success) return fail("Invalid group.");

  try {
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

export async function removeMemberAction(
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = removeMemberSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request.");

  try {
    // The service verifies: caller is an ADMIN of THIS group, target is an
    // active member of THIS group, and target is not the caller.
    await removeMember(parsed.data.groupId, user.id, parsed.data.userId);
    revalidatePath(`/groups/${parsed.data.groupId}`);
    revalidatePath("/groups");
    return ok(null);
  } catch (error) {
    return toFailure(error);
  }
}

export async function deleteGroupAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = deleteGroupSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request.");

  try {
    await deleteGroup(parsed.data.groupId, user.id, parsed.data.confirmName);
    revalidatePath("/groups");
    return ok(null);
  } catch (error) {
    return toFailure(error);
  }
}
