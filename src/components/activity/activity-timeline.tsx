"use client";

import {
  ArrowRight,
  History,
  Loader2,
  LogOut,
  MailPlus,
  Pencil,
  Receipt,
  RefreshCw,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  HandCoins,
} from "lucide-react";
import { useState } from "react";
import { loadActivityPageAction } from "@/app/(dashboard)/groups/[groupId]/activity-actions";
import { Button } from "@/components/ui/button";
import { presentActivity } from "@/lib/activities/display";
import type {
  ActivityAction,
  ActivityItem,
  ActivityPage,
} from "@/lib/activities/types";

const ACTION_ICONS = {
  GROUP_CREATED: Users,
  MEMBER_JOINED: UserPlus,
  MEMBER_REMOVED: UserMinus,
  MEMBER_LEFT: LogOut,
  INVITE_CREATED: MailPlus,
  INVITE_REGENERATED: RefreshCw,
  INVITE_ACCEPTED: UserPlus,
  EXPENSE_CREATED: Receipt,
  EXPENSE_UPDATED: Pencil,
  EXPENSE_DELETED: Trash2,
  SETTLEMENT_RECORDED: HandCoins,
} satisfies Record<ActivityAction, typeof History>;

const iconTone: Partial<Record<ActivityAction, string>> = {
  GROUP_CREATED: "bg-primary/10 text-primary",
  MEMBER_JOINED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  INVITE_ACCEPTED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  MEMBER_REMOVED: "bg-destructive/10 text-destructive",
  MEMBER_LEFT: "bg-muted text-muted-foreground",
  EXPENSE_DELETED: "bg-destructive/10 text-destructive",
  SETTLEMENT_RECORDED: "bg-primary/10 text-primary",
};

type Props = {
  groupId: string;
  initialPage: ActivityPage;
};

export function ActivityTimeline({ groupId, initialPage }: Props) {
  const [items, setItems] = useState<ActivityItem[]>(initialPage.items);
  const [nextCursor, setNextCursor] = useState<string | null>(
    initialPage.nextCursor,
  );
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (!nextCursor || pending) return;

    setPending(true);
    setError(null);

    try {
      const result = await loadActivityPageAction(groupId, nextCursor, 20);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [
          ...current,
          ...result.data.items.filter((item) => !seen.has(item.id)),
        ];
      });
      setNextCursor(result.data.nextCursor);
      setHasMore(result.data.hasMore);
    } catch {
      setError("Could not load more activity. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-8 text-center">
        <History className="mx-auto size-8 text-muted-foreground/70" />
        <p className="mt-3 text-sm font-medium">No activity yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Group changes, expenses, and settlements will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <ol className="space-y-0">
        {items.map((item, index) => {
          const presentation = presentActivity(item);
          const Icon = ACTION_ICONS[item.action] ?? History;
          const showLine = index < items.length - 1 || hasMore;

          return (
            <li key={item.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                    iconTone[item.action] ??
                    "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="size-4" />
                </span>
                {showLine && (
                  <span
                    aria-hidden="true"
                    className="mt-1 w-px flex-1 bg-border"
                  />
                )}
              </div>

              <div className="min-w-0 flex-1 pb-5">
                <p className="text-sm leading-6">
                  <span className="font-medium">
                    {item.actor?.name ?? "System"}
                  </span>{" "}
                  {presentation.actionText}
                  {presentation.entityLabel && (
                    <>
                      :{" "}
                      <span className="font-medium">
                        {presentation.entityLabel}
                      </span>
                    </>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.createdAtLabel}
                </p>

                {presentation.details.length > 0 && (
                  <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {presentation.details.map((detail) => (
                      <div
                        key={`${detail.label}-${detail.value}`}
                        className="flex gap-1"
                      >
                        <dt className="text-muted-foreground">{detail.label}</dt>
                        <dd className="font-medium">{detail.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {presentation.changes.length > 0 && (
                  <ul className="mt-2 space-y-1 rounded-lg bg-muted/40 p-2">
                    {presentation.changes.map((change) => (
                      <li
                        key={change.label}
                        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
                      >
                        <span className="font-medium text-muted-foreground">
                          {change.label}
                        </span>
                        <span className="line-through text-muted-foreground">
                          {change.before}
                        </span>
                        <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                        <span className="font-medium">{change.after}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex justify-center border-t pt-4">
        {hasMore && nextCursor ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadMore}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {pending ? "Loading..." : "Load more activity"}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            End of activity history
          </p>
        )}
      </div>
    </div>
  );
}
