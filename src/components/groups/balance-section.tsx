import { ArrowDownLeft, ArrowUpRight, Scale } from "lucide-react";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  GroupBalanceResult,
  MemberBalanceView,
} from "@/lib/balances/types";
import { NotFoundError } from "@/lib/errors";
import { formatExpenseDate } from "@/lib/expenses/display";
import {
  formatPoisha,
  parseMoneyToPoisha,
  parseSignedMoneyToPoisha,
} from "@/lib/money";
import { getGroupBalances } from "@/lib/services/balance.service";
import { SETTLEMENT_METHOD_LABELS } from "@/lib/settlements/display";
import type { SettlementMethod } from "@/lib/settlements/types";

export async function BalanceSection({ groupId }: { groupId: string }) {
  const result = await getGroupBalances(groupId).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });

  return <BalanceSectionView result={result} />;
}

export function BalanceSectionSkeleton() {
  return (
    <Card aria-busy="true" aria-label="Loading group balances">
      <CardHeader>
        <div className="h-5 w-24 animate-pulse rounded bg-muted" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="space-y-2 border-t pt-4 first:border-0 first:pt-0">
              <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function BalanceSectionView({ result }: { result: GroupBalanceResult }) {
  if (!result.ok) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Scale className="size-4 text-muted-foreground" />
            <CardTitle>Balances</CardTitle>
          </div>
          <CardDescription>
            Totals from the group&apos;s recorded expenses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {result.error}
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalExpenses = parseMoneyToPoisha(result.data.totalExpenses);
  const members = result.data.members;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Scale className="size-4 text-muted-foreground" />
          <CardTitle>Balances</CardTitle>
        </div>
        <CardDescription>
          Positive balances are owed money; negative balances owe money.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Group total expenses
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold">
              {formatPoisha(totalExpenses)}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Net group total
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold">
              {formatPoisha(0n)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Owed and owing balances always cancel to zero.
            </p>
          </div>
        </div>

        {totalExpenses === 0n && (
          <div className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
            No expenses have been recorded for this group yet. Everyone is
            settled at ৳0.00.
          </div>
        )}

        {members.length === 0 ? (
          <div className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            There are no members to show balances for.
          </div>
        ) : (
          <ul className="divide-y">
            {members.map((member) => (
              <MemberBalanceRow
                key={member.userId}
                member={member}
                isCurrentUser={member.userId === result.data.currentUserId}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function MemberBalanceRow({
  member,
  isCurrentUser,
}: {
  member: MemberBalanceView;
  isCurrentUser: boolean;
}) {
  const paid = parseMoneyToPoisha(member.paid);
  const share = parseMoneyToPoisha(member.share);
  const settlementsSent = parseMoneyToPoisha(member.settlementsSent);
  const settlementsReceived = parseMoneyToPoisha(member.settlementsReceived);
  const net = parseSignedMoneyToPoisha(member.net);

  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-medium text-primary">
            {member.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate text-sm font-medium">
                {member.name}
                {isCurrentUser && (
                  <span className="text-muted-foreground"> (you)</span>
                )}
              </p>
              <StatusBadge status={member.status} />
              {!member.isActive && <Badge variant="outline">Former</Badge>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Paid {formatPoisha(paid)} · Share {formatPoisha(share)}
            </p>
            <p className="text-xs text-muted-foreground">
              Settlements sent {formatPoisha(settlementsSent)} · received{" "}
              {formatPoisha(settlementsReceived)}
            </p>
          </div>
        </div>

        <div className="sm:text-right">
          <p
            className={`font-mono text-lg font-semibold ${netToneClass(net)}`}
          >
            {formatSignedPoisha(net)}
          </p>
          <p className="text-xs text-muted-foreground">
            {statusDescription(member.status)}
          </p>
        </div>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Calculation breakdown
        </summary>
        <div className="mt-2 space-y-4 rounded-lg bg-muted/40 p-3">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Expenses</p>
            {member.entries.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No expenses involve this member yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {member.entries.map((entry) => {
                  const entryEffect = parseSignedMoneyToPoisha(entry.effect);

                  return (
                    <li
                      key={entry.expenseId}
                      className="space-y-1 border-t border-border/60 pt-3 first:border-0 first:pt-0"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-foreground">
                            {entry.description}
                          </p>
                          {entry.expenseDate && (
                            <p className="text-xs text-muted-foreground">
                              {formatExpenseDate(entry.expenseDate)}
                            </p>
                          )}
                        </div>
                        <p
                          className={`shrink-0 font-mono text-xs font-medium ${netToneClass(entryEffect)}`}
                        >
                          {formatSignedPoisha(entryEffect)}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Paid {formatPoisha(parseMoneyToPoisha(entry.paid))} ·
                        Share {formatPoisha(parseMoneyToPoisha(entry.share))}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="space-y-2 border-t border-border/60 pt-3">
            <p className="text-xs font-semibold text-foreground">Settlements</p>
            {member.settlementEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No settlements involve this member yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {member.settlementEntries.map((entry) => {
                  const entryEffect = parseSignedMoneyToPoisha(entry.effect);
                  const sent = entry.fromUserId === member.userId;
                  const method = formatSettlementMethod(entry.method);

                  return (
                    <li
                      key={entry.settlementId}
                      className="space-y-1 border-t border-border/60 pt-3 first:border-0 first:pt-0"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-foreground">
                            {sent
                              ? `Sent to ${entry.toName}`
                              : `Received from ${entry.fromName}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {entry.settledAtLabel ?? "Recorded settlement"}
                            {method ? ` · ${method}` : ""}
                          </p>
                          {entry.transactionReference && (
                            <p className="truncate text-xs text-muted-foreground">
                              Ref: {entry.transactionReference}
                            </p>
                          )}
                        </div>
                        <p
                          className={`shrink-0 font-mono text-xs font-medium ${netToneClass(entryEffect)}`}
                        >
                          {formatSignedPoisha(entryEffect)}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Amount {formatPoisha(parseMoneyToPoisha(entry.amount))}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-border/60 pt-2 text-xs font-medium">
            Paid {formatPoisha(paid)} − Share {formatPoisha(share)} + Sent{" "}
            {formatPoisha(settlementsSent)} − Received{" "}
            {formatPoisha(settlementsReceived)} ={" "}
            <span className={netToneClass(net)}>
              {formatSignedPoisha(net)}
            </span>
          </div>
        </div>
      </details>
    </li>
  );
}

function StatusBadge({ status }: { status: MemberBalanceView["status"] }) {
  if (status === "owed") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-success/40 text-success"
      >
        <ArrowUpRight className="size-3" />
        Owed
      </Badge>
    );
  }

  if (status === "owes") {
    return (
      <Badge variant="destructive" className="gap-1">
        <ArrowDownLeft className="size-3" />
        Owes
      </Badge>
    );
  }

  return <Badge variant="outline">Settled</Badge>;
}

function statusDescription(status: MemberBalanceView["status"]): string {
  if (status === "owed") return "is owed money";
  if (status === "owes") return "owes money";
  return "is settled up";
}

function netToneClass(net: bigint): string {
  if (net > 0n) return "text-success";
  if (net < 0n) return "text-destructive";
  return "text-muted-foreground";
}

function formatSignedPoisha(amount: bigint): string {
  return amount > 0n ? `+${formatPoisha(amount)}` : formatPoisha(amount);
}

function formatSettlementMethod(method: string | undefined): string | null {
  if (!method) return null;
  return SETTLEMENT_METHOD_LABELS[method as SettlementMethod] ?? method;
}
