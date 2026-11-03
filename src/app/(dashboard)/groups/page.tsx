import { Plus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { listGroupsForUser } from "@/lib/services/group.service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Groups" };

export default async function GroupsPage() {
  const user = await requireUser();
  const groups = await listGroupsForUser(user.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Groups</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Flats, friends and trips you share expenses with.
          </p>
        </div>
        <Link href="/groups/new" className={cn(buttonVariants())}>
          <Plus className="size-4" />
          New group
        </Link>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardHeader className="items-center py-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-accent text-primary">
              <Users className="size-6" />
            </div>
            <CardTitle className="mt-2">No groups yet</CardTitle>
            <CardDescription>
              Create your first group to start splitting expenses.
            </CardDescription>
            <Link href="/groups/new" className={cn(buttonVariants(), "mt-3")}>
              <Plus className="size-4" />
              Create a group
            </Link>
          </CardHeader>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {groups.map((group) => (
            <li key={group.id}>
              <Link
                href={`/groups/${group.id}`}
                className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring"
              >
                <Card className="h-full transition-colors hover:border-primary/40">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="truncate">{group.name}</CardTitle>
                      <Badge variant="outline">
                        {group.role === "ADMIN" ? "Admin" : "Member"}
                      </Badge>
                    </div>
                    <CardDescription className="line-clamp-2">
                      {group.description ?? "No description"}
                    </CardDescription>
                    <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                      <Users className="size-3.5" />
                      {group.memberCount}{" "}
                      {group.memberCount === 1 ? "member" : "members"}
                    </p>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
