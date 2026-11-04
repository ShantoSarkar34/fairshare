import { Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  BkashSandboxSection,
  BkashSandboxSectionSkeleton,
} from "@/components/bkash/bkash-sandbox-section";
import {
  BalanceSection,
  BalanceSectionSkeleton,
} from "@/components/groups/balance-section";
import { DeleteGroupSection } from "@/components/groups/delete-group-section";
import { InvitePanel } from "@/components/groups/invite-panel";
import { RemoveMemberButton } from "@/components/groups/remove-member-button";
import {
  SettlementSection,
  SettlementSectionSkeleton,
} from "@/components/settlements/settlement-section";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import { getGroupForMember } from "@/lib/services/group.service";
import { getInviteSummary } from "@/lib/services/invite.service";

export const metadata: Metadata = { title: "Group" };

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

export default async function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const user = await requireUser();

  // A non-member and a non-existent group look identical: both give a 404.
  const group = await getGroupForMember(groupId, user.id).catch(
    (error: unknown) => {
      if (error instanceof NotFoundError) notFound();
      throw error;
    },
  );

  const isAdmin = group.currentUserRole === "ADMIN";

  // Only admins load invite info (and the service re-checks the role).
  const inviteSummary = isAdmin
    ? await getInviteSummary(group.id, user.id)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{group.name}</h1>
            <Badge variant="outline">{isAdmin ? "Admin" : "Member"}</Badge>
          </div>
          {group.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {group.description}
            </p>
          )}
        </div>

        <Link
          href={`/groups/${group.id}/expenses`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Receipt />
          Expenses
        </Link>
      </div>

      <Suspense fallback={<BalanceSectionSkeleton />}>
        <BalanceSection groupId={group.id} />
      </Suspense>

      <Suspense fallback={<SettlementSectionSkeleton />}>
        <SettlementSection groupId={group.id} />
      </Suspense>

      <Suspense fallback={<BkashSandboxSectionSkeleton />}>
        <BkashSandboxSection groupId={group.id} />
      </Suspense>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            {group.members.length}{" "}
            {group.members.length === 1 ? "person" : "people"} in this group
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {group.members.map((member) => (
              <li
                key={member.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-medium text-primary">
                    {member.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {member.name}
                      {member.userId === user.id && (
                        <span className="text-muted-foreground"> (you)</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {member.email} · joined{" "}
                      {dateFormat.format(member.joinedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge variant="outline">
                    {member.role === "ADMIN" ? "Admin" : "Member"}
                  </Badge>
                  {/* UI convenience only. The server action re-checks the role. */}
                  {isAdmin && member.userId !== user.id && (
                    <RemoveMemberButton
                      groupId={group.id}
                      userId={member.userId}
                      name={member.name}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {isAdmin && (
        <>
          <InvitePanel
            groupId={group.id}
            activeExpiryLabel={
              inviteSummary ? dateFormat.format(inviteSummary.expiresAt) : null
            }
          />
          <DeleteGroupSection groupId={group.id} groupName={group.name} />
        </>
      )}
    </div>
  );
}
