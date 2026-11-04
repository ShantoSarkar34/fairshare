import { History } from "lucide-react";
import { notFound } from "next/navigation";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import { getGroupActivityPage } from "@/lib/services/activity.service";

export async function ActivitySection({ groupId }: { groupId: string }) {
  const user = await requireUser();

  const page = await getGroupActivityPage(groupId, user.id, {
    limit: 20,
  }).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    console.error(`Activity history failed for group "${groupId}":`, error);
    return null;
  });

  return (
    <Card aria-labelledby="activity-heading">
      <CardHeader>
        <CardTitle id="activity-heading" className="flex items-center gap-2">
          <History className="size-5" />
          Activity history
        </CardTitle>
        <CardDescription>
          A chronological record of changes to this group. Activity is
          append-only and kept when expenses or members are removed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {page ? (
          <ActivityTimeline
            // A router.refresh() after a new activity must remount with the
            // newest first page instead of keeping the old client state.
            key={`${page.items[0]?.id ?? "empty"}:${page.items.length}:${
              page.nextCursor ?? ""
            }`}
            groupId={groupId}
            initialPage={page}
          />
        ) : (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            Activity history could not be loaded. Please try again.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function ActivitySectionSkeleton() {
  return (
    <Card aria-busy="true" aria-label="Loading activity history">
      <CardHeader>
        <div className="h-5 w-36 animate-pulse rounded bg-muted" />
        <div className="h-4 w-4/5 max-w-full animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent className="space-y-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex gap-3">
            <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
