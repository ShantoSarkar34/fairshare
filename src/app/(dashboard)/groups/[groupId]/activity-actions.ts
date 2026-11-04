"use server";

import { z } from "zod";
import { fail, ok, toFailure, type ActionResult } from "@/lib/actions/result";
import { requireUser } from "@/lib/auth/session";
import type { ActivityPage } from "@/lib/activities/types";
import { getGroupActivityPage } from "@/lib/services/activity.service";
import { activityPageActionSchema } from "@/lib/validations/activity";

/**
 * Loads one more page of activity. Identity and authorization come from the
 * session; the client can only choose a group, an opaque cursor and a bounded
 * page size. There is deliberately no action that creates or edits activity.
 */
export async function loadActivityPageAction(
  groupId: unknown,
  cursor: unknown,
  limit: unknown,
): Promise<ActionResult<ActivityPage>> {
  const user = await requireUser();

  const parsed = activityPageActionSchema.safeParse({
    groupId,
    cursor: cursor === null ? undefined : cursor,
    limit,
  });

  if (!parsed.success) {
    return fail(
      "Invalid activity request.",
      z.flattenError(parsed.error).fieldErrors,
    );
  }

  try {
    const page = await getGroupActivityPage(
      parsed.data.groupId,
      user.id,
      {
        cursor: parsed.data.cursor,
        limit: parsed.data.limit,
      },
    );

    return ok(page);
  } catch (error) {
    return toFailure(error);
  }
}
