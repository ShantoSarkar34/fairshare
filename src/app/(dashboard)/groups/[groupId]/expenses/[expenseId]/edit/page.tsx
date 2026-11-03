import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { requireUser } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import type {
  ExpenseFormInitialValues,
  ExpenseMember,
} from "@/lib/expenses/types";
import { getExpenseForMember } from "@/lib/services/expense.service";
import { getGroupForMember } from "@/lib/services/group.service";

export const metadata: Metadata = { title: "Edit expense" };

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ groupId: string; expenseId: string }>;
}) {
  const { groupId, expenseId } = await params;
  const user = await requireUser();

  const group = await getGroupForMember(groupId, user.id).catch(
    (error: unknown) => {
      if (error instanceof NotFoundError) notFound();
      throw error;
    },
  );

  const expense = await getExpenseForMember(groupId, expenseId, user.id).catch(
    (error: unknown) => {
      if (error instanceof NotFoundError) notFound();
      throw error;
    },
  );

  // UI convenience only: the service re-checks the creator/admin rule.
  if (!expense.canManage) notFound();

  const members: ExpenseMember[] = group.members.map((member) => ({
    userId: member.userId,
    name: member.name,
    email: member.email,
  }));

  const initialValues: ExpenseFormInitialValues = {
    description: expense.description,
    amount: expense.amount,
    expenseDate: expense.expenseDate,
    paidById: expense.paidBy.id,
    splitType: expense.splitType,
    participants: expense.participants.map((participant) => ({
      userId: participant.userId,
      shareAmount: participant.shareAmount,
      splitValue: participant.splitValue,
    })),
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href={`/groups/${group.id}/expenses/${expense.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to expense
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Edit expense</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Update the details for {expense.description} in {group.name}.
          </p>
        </div>
      </div>

      <ExpenseForm
        groupId={group.id}
        members={members}
        currentUserId={user.id}
        defaultExpenseDate={expense.expenseDate}
        mode="edit"
        expenseId={expense.id}
        initialValues={initialValues}
      />
    </div>
  );
}
