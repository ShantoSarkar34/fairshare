import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { requireUser } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import type { ExpenseMember } from "@/lib/expenses/types";
import { getGroupForMember } from "@/lib/services/group.service";

export const metadata: Metadata = { title: "Add expense" };

export default async function NewExpensePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const user = await requireUser();

  const group = await getGroupForMember(groupId, user.id).catch(
    (error: unknown) => {
      if (error instanceof NotFoundError) notFound();
      throw error;
    },
  );

  const members: ExpenseMember[] = group.members.map((member) => ({
    userId: member.userId,
    name: member.name,
    email: member.email,
  }));

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href={`/groups/${group.id}/expenses`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to expenses
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Add expense</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Record a shared cost for {group.name}.
          </p>
        </div>
      </div>

      <ExpenseForm
        groupId={group.id}
        members={members}
        currentUserId={user.id}
        defaultExpenseDate={today}
        mode="create"
      />
    </div>
  );
}
