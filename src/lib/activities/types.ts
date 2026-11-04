/**
 * Shared, client-safe activity types.
 *
 * The database column is named `type`, but the public service/UI shape calls it
 * `action` to match the domain language used by the activity feed.
 */
export const ACTIVITY_ACTIONS = [
  "GROUP_CREATED",
  "MEMBER_JOINED",
  "MEMBER_REMOVED",
  "MEMBER_LEFT",
  "INVITE_CREATED",
  "INVITE_REGENERATED",
  "INVITE_ACCEPTED",
  "EXPENSE_CREATED",
  "EXPENSE_UPDATED",
  "EXPENSE_DELETED",
  "SETTLEMENT_RECORDED",
] as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export type ActivityActor = {
  id: string;
  name: string;
};

/**
 * Metadata is intentionally treated as unknown data at the boundary. The
 * writer sanitizes it, and the presentation helpers parse only known fields.
 */
export type ActivityMetadata = Record<string, unknown> | null;

export type ActivityItem = {
  id: string;
  action: ActivityAction;
  actor: ActivityActor | null;
  entityType: string | null;
  entityId: string | null;
  metadata: ActivityMetadata;
  createdAt: string;
  /** Pre-formatted on the server to avoid timezone hydration mismatches. */
  createdAtLabel: string;
};

export type ActivityPage = {
  items: ActivityItem[];
  nextCursor: string | null;
  hasMore: boolean;
};
