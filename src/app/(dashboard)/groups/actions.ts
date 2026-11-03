"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, ok, toFailure, type ActionResult } from "@/lib/actions/result";
import { requireUser } from "@/lib/auth/session";
import { createGroup } from "@/lib/services/group.service";
import { createGroupSchema } from "@/lib/validations/group";

export async function createGroupAction(
  input: unknown
): Promise<ActionResult<{ groupId: string }>> {
  // Identity comes from the session, never from the input. requireUser()
  // redirects by throwing, so it must stay OUTSIDE the try/catch below.
  const user = await requireUser();

  // Server-side validation. The client form validates too, but that is only UX.
  const parsed = createGroupSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      "Please fix the highlighted fields.",
      z.flattenError(parsed.error).fieldErrors
    );
  }

  try {
    const group = await createGroup(user.id, parsed.data);
    revalidatePath("/groups");
    return ok({ groupId: group.id });
  } catch (error) {
    return toFailure(error);
  }
}