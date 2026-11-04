import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { formatActivityDateTime } from "@/lib/activities/display";
import { sanitizeActivityMetadata } from "@/lib/activities/metadata";
import type {
  ActivityAction,
  ActivityItem,
  ActivityPage,
} from "@/lib/activities/types";
import { prisma } from "@/lib/db/prisma";
import { ValidationError } from "@/lib/errors";
import { requireMembership } from "@/lib/services/group-access";
import {
  ACTIVITY_DEFAULT_PAGE_SIZE,
  activityCursorPayloadSchema,
  activityPageQuerySchema,
  type ActivityPageQueryInput,
} from "@/lib/validations/activity";

type ActivityRow = {
  id: string;
  type: ActivityAction;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  createdAt: Date;
  actor: { id: string; name: string } | null;
};

type DecodedCursor = {
  createdAt: Date;
  id: string;
};

export type RecordActivityInput = {
  groupId: string;
  actorId?: string | null;
  action: ActivityAction;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Adds one immutable activity row using the caller's transaction. Keeping this
 * helper transaction-bound is what guarantees that a failed business operation
 * cannot leave a successful activity behind.
 *
 * Callers must use the authenticated user's id as actorId. There is deliberately
 * no public server action that accepts an actor id from the browser.
 */
export async function recordActivity(
  tx: Prisma.TransactionClient,
  input: RecordActivityInput,
): Promise<void> {
  const metadata = sanitizeActivityMetadata(input.metadata);

  await tx.activity.create({
    data: {
      groupId: input.groupId,
      actorId: input.actorId ?? null,
      type: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      ...(metadata ? { metadata: metadata as Prisma.InputJsonValue } : {}),
    },
  });
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ createdAt: createdAt.toISOString(), id }),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(cursor: string): DecodedCursor {
  let parsed: unknown;

  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new ValidationError("Invalid activity cursor");
  }

  const result = activityCursorPayloadSchema.safeParse(parsed);
  if (!result.success) {
    throw new ValidationError("Invalid activity cursor");
  }

  const createdAt = new Date(result.data.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    throw new ValidationError("Invalid activity cursor");
  }

  return { createdAt, id: result.data.id };
}

function toActivityItem(row: ActivityRow): ActivityItem {
  const createdAt = row.createdAt.toISOString();

  return {
    id: row.id,
    action: row.type,
    actor: row.actor ? { id: row.actor.id, name: row.actor.name } : null,
    entityType: row.entityType,
    entityId: row.entityId,
    metadata: sanitizeActivityMetadata(row.metadata),
    createdAt,
    createdAtLabel: formatActivityDateTime(createdAt),
  };
}

/**
 * Returns one bounded, newest-first page of activity for a group.
 *
 * The membership check happens before the query, so a non-member or a user
 * probing another group's id receives the same NotFound error as a missing
 * group. Cursor pagination avoids loading an unlimited history and remains
 * stable while new activity is being written.
 */
export async function getGroupActivityPage(
  groupId: string,
  userId: string,
  options: ActivityPageQueryInput = {},
): Promise<ActivityPage> {
  const parsed = activityPageQuerySchema.safeParse(options);
  if (!parsed.success) {
    throw new ValidationError("Invalid activity pagination options");
  }

  await requireMembership(groupId, userId);

  const { cursor } = parsed.data;
  const limit = parsed.data.limit ?? ACTIVITY_DEFAULT_PAGE_SIZE;
  const decodedCursor = cursor ? decodeCursor(cursor) : null;

  const rows = await prisma.activity.findMany({
    where: decodedCursor
      ? {
          groupId,
          OR: [
            { createdAt: { lt: decodedCursor.createdAt } },
            {
              createdAt: decodedCursor.createdAt,
              id: { lt: decodedCursor.id },
            },
          ],
        }
      : { groupId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      type: true,
      entityType: true,
      entityId: true,
      metadata: true,
      createdAt: true,
      actor: { select: { id: true, name: true } },
    },
  });

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const lastRow = pageRows.at(-1);

  return {
    items: pageRows.map(toActivityItem),
    nextCursor:
      hasMore && lastRow ? encodeCursor(lastRow.createdAt, lastRow.id) : null,
    hasMore,
  };
}
