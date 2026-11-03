import { ArrowLeft, ChevronRight, Plus, Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
  formatExpenseDate,
  SPLIT_TYPE_LABELS,
} from "@/lib/expenses/display";
import { formatPoisha, parseMoneyToPoisha } from "@/lib/money";
import { listExpensesForGroup } from "@/lib/services/expense.service";
import { getGroupForMember } from "@/lib/services/group.service";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage({
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

  const expenses = await listExpensesForGroup(group.id, user.id);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href={`/groups/${group.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to {group.name}
        </Link>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Expenses</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Shared costs recorded for {group.name}.
            </p>
          </div>

          <Link
            href={`/groups/${group.id}/expenses/new`}
            className={buttonVariants({ size: "sm" })}
          >
            <Plus />
            Add expense
          </Link>
        </div>
      </div>

      {expenses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-accent text-primary">
              <Receipt className="size-5" />
            </span>
            <div>
              <p className="font-medium">No expenses yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add the first shared cost for this group.
              </p>
            </div>
            <Link
              href={`/groups/${group.id}/expenses/new`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Plus />
              Add expense
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {expenses.map((expense) => (
            <li key={expense.id}>
              <Card size="sm">
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Link
                    href={`/groups/${group.id}/expenses/${expense.id}`}
                    className="min-w-0 flex-1 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {expense.description}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatExpenseDate(expense.expenseDate)} · Paid by{" "}
                          {expense.paidBy.name}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {expense.participants.length}{" "}
                          {expense.participants.length === 1
                            ? "participant"
                            : "participants"}
                          {expense.participants.length > 0 &&
                            `: ${expense.participants
                              .map((participant) => participant.name)
                              .join(", ")}`}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="font-mono text-sm font-medium">
                          {formatPoisha(
                            parseMoneyToPoisha(expense.amount),
                          )}
                        </p>
                        <Badge variant="outline" className="mt-1">
                          {SPLIT_TYPE_LABELS[expense.splitType]}
                        </Badge>
                      </div>
                    </div>
                  </Link>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {expense.canManage && (
                      <Link
                        href={`/groups/${group.id}/expenses/${expense.id}/edit`}
                        className={buttonVariants({
                          variant: "outline",
                          size: "sm",
                        })}
                      >
                        Edit
                      </Link>
                    )}
                    <Link
                      href={`/groups/${group.id}/expenses/${expense.id}`}
                      aria-label={`View ${expense.description}`}
                      className={buttonVariants({
                        variant: "ghost",
                        size: "icon-sm",
                      })}
                    >
                      <ChevronRight />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card size="sm">
        <CardHeader>
          <CardTitle>Split reminders</CardTitle>
          <CardDescription>
            Allocations are stored as exact integer poisha. Percentages use
            10,000 basis points for 100%.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
