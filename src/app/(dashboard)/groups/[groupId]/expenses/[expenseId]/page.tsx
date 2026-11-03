import { ArrowLeft, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteExpenseButton } from "@/components/expenses/delete-expense-button";
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
import {
  describeSplitValue,
  formatExpenseDate,
  SPLIT_TYPE_LABELS,
} from "@/lib/expenses/display";
import { formatPoisha, parseMoneyToPoisha } from "@/lib/money";
import { getExpenseForMember } from "@/lib/services/expense.service";

export const metadata: Metadata = { title: "Expense" };

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ groupId: string; expenseId: string }>;
}) {
  const { groupId, expenseId } = await params;
  const user = await requireUser();

  const expense = await getExpenseForMember(
    groupId,
    expenseId,
    user.id,
  ).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });

  const payerIsParticipant = expense.participants.some(
    (participant) => participant.userId === expense.paidBy.id,
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href={`/groups/${expense.groupId}/expenses`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to expenses
        </Link>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{expense.description}</h1>
              <Badge variant="outline">
                {SPLIT_TYPE_LABELS[expense.splitType]}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {expense.groupName}
            </p>
          </div>

          {expense.canManage && (
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href={`/groups/${expense.groupId}/expenses/${expense.id}/edit`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Pencil />
                Edit
              </Link>
              <DeleteExpenseButton
                groupId={expense.groupId}
                expenseId={expense.id}
                description={expense.description}
              />
            </div>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Amount
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold">
              {formatPoisha(parseMoneyToPoisha(expense.amount))}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Expense date
            </p>
            <p className="mt-1 text-sm font-medium">
              {formatExpenseDate(expense.expenseDate)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Paid by
            </p>
            <p className="mt-1 truncate text-sm font-medium">
              {expense.paidBy.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {expense.paidBy.email}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Created by
            </p>
            <p className="mt-1 truncate text-sm font-medium">
              {expense.createdBy.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {expense.createdBy.email}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Allocations</CardTitle>
          <CardDescription>
            {expense.participants.length}{" "}
            {expense.participants.length === 1 ? "participant" : "participants"}
            {!payerIsParticipant &&
              ". The payer is not included in this split."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {expense.participants.map((participant) => {
              const splitLabel = describeSplitValue(
                expense.splitType,
                participant.splitValue,
              );

              return (
                <li
                  key={participant.userId}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-medium text-primary">
                      {participant.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {participant.name}
                        {participant.userId === expense.paidBy.id && (
                          <span className="text-muted-foreground">
                            {" "}
                            · payer
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {participant.email}
                        {splitLabel ? ` · ${splitLabel}` : ""}
                      </p>
                    </div>
                  </div>

                  <p className="shrink-0 font-mono text-sm font-medium">
                    {formatPoisha(
                      parseMoneyToPoisha(participant.shareAmount),
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
