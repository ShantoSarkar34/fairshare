"use client";

import { ArrowRight, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { recordSettlementAction } from "@/app/(dashboard)/groups/[groupId]/settlement-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FieldErrors } from "@/lib/actions/result";
import {
  formatPoisha,
  parseMoneyToPoisha,
  parseSignedMoneyToPoisha,
} from "@/lib/money";
import { SETTLEMENT_METHOD_LABELS } from "@/lib/settlements/display";
import type {
  SettlementHistoryItem,
  SettlementMethod,
  SettlementOverviewData,
  SuggestedTransferView,
} from "@/lib/settlements/types";

const selectClassName =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

export function SettlementPanel({
  groupId,
  data,
}: {
  groupId: string;
  data: SettlementOverviewData;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const debtors = useMemo(
    () => data.members.filter((member) => parseSignedMoneyToPoisha(member.net) < 0n),
    [data.members],
  );
  const creditors = useMemo(
    () => data.members.filter((member) => parseSignedMoneyToPoisha(member.net) > 0n),
    [data.members],
  );
  const currentMember = data.members.find(
    (member) => member.userId === data.currentUserId,
  );
  const currentIsDebtor =
    currentMember !== undefined && parseSignedMoneyToPoisha(currentMember.net) < 0n;
  const currentIsCreditor =
    currentMember !== undefined && parseSignedMoneyToPoisha(currentMember.net) > 0n;
  const isAdmin = data.currentUserRole === "ADMIN";
  const allowedFrom = isAdmin
    ? debtors
    : currentIsDebtor && currentMember
      ? [currentMember]
      : [];
  const allowedTo = isAdmin
    ? creditors
    : currentIsCreditor && currentMember
      ? [currentMember]
      : [];

  const firstAllowedSuggestion = data.suggestions.find(
    (suggestion) =>
      allowedFrom.some((member) => member.userId === suggestion.fromUserId) &&
      allowedTo.some((member) => member.userId === suggestion.toUserId),
  );

  const [fromUserId, setFromUserId] = useState(
    firstAllowedSuggestion?.fromUserId ?? allowedFrom[0]?.userId ?? "",
  );
  const [toUserId, setToUserId] = useState(
    firstAllowedSuggestion?.toUserId ?? allowedTo[0]?.userId ?? "",
  );
  const [amount, setAmount] = useState(firstAllowedSuggestion?.amount ?? "");
  const [method, setMethod] = useState<SettlementMethod>("BKASH");
  const [transactionReference, setTransactionReference] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const canShowForm = allowedFrom.length > 0 && allowedTo.length > 0;

  // After a refresh, a previously selected member may no longer have that
  // role. Fall back to a valid option without an extra state update.
  const selectedFromUserId = allowedFrom.some(
    (member) => member.userId === fromUserId,
  )
    ? fromUserId
    : (allowedFrom[0]?.userId ?? "");
  const selectedToUserId = allowedTo.some(
    (member) => member.userId === toUserId,
  )
    ? toUserId
    : (allowedTo[0]?.userId ?? "");

  function applySuggestion(suggestion: SuggestedTransferView) {
    setFromUserId(suggestion.fromUserId);
    setToUserId(suggestion.toUserId);
    setAmount(suggestion.amount);
    setServerError(null);
    setFieldErrors({});
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    formRef.current?.querySelector<HTMLInputElement>("#amount")?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError(null);
    setFieldErrors({});

    try {
      const poisha = parseMoneyToPoisha(amount);
      if (poisha <= 0n) {
        setServerError("Amount must be greater than zero");
        return;
      }
    } catch (error) {
      setServerError(
        error instanceof Error ? error.message : "Enter a valid amount",
      );
      return;
    }

    setPending(true);

    try {
      const result = await recordSettlementAction(groupId, {
        fromUserId: selectedFromUserId,
        toUserId: selectedToUserId,
        amount,
        method,
        transactionReference,
        note,
      });

      if (!result.ok) {
        setServerError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }

      toast.success("Settlement recorded");
      setAmount("");
      setTransactionReference("");
      setNote("");
      router.refresh();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-labelledby="suggested-payments-heading">
        <div>
          <h3
            id="suggested-payments-heading"
            className="text-sm font-semibold"
          >
            Suggested payments
          </h3>
          <p className="text-xs text-muted-foreground">
            These suggestions settle the current balances. The greedy matching
            does not always produce the smallest possible number of payments.
          </p>
        </div>

        {data.suggestions.length === 0 ? (
          <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            Everyone is settled up. No transfers are needed.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.suggestions.map((suggestion) => {
              const canRecord =
                isAdmin ||
                suggestion.fromUserId === data.currentUserId ||
                suggestion.toUserId === data.currentUserId;

              return (
                <li
                  key={`${suggestion.fromUserId}-${suggestion.toUserId}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <span className="truncate font-medium">
                      {suggestion.fromName}
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium">
                      {suggestion.toName}
                    </span>
                    <span className="ml-1 font-mono text-sm">
                      {formatPoisha(
                        parseMoneyToPoisha(suggestion.amount),
                      )}
                    </span>
                  </div>
                  {canRecord && canShowForm && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => applySuggestion(suggestion)}
                    >
                      Record payment
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="record-payment-heading">
        <div>
          <h3 id="record-payment-heading" className="text-sm font-semibold">
            Record a manual payment
          </h3>
          <p className="text-xs text-muted-foreground">
            Record money that was sent directly to another member. For bKash,
            the sender transfers money in their own bKash app; FairShare only
            records the payment and does not verify the external transfer.
          </p>
        </div>

        {!canShowForm ? (
          <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            {data.suggestions.length === 0
              ? "There is nothing to settle right now."
              : "Only the sender, receiver, or a group admin can record this payment."}
          </p>
        ) : (
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
          >
            <div className="space-y-1.5">
              <Label htmlFor="fromUserId">From (debtor)</Label>
              <select
                id="fromUserId"
                className={selectClassName}
                value={selectedFromUserId}
                onChange={(event) => setFromUserId(event.target.value)}
                disabled={pending}
                required
              >
                {allowedFrom.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name}
                    {member.userId === data.currentUserId ? " (you)" : ""}
                  </option>
                ))}
              </select>
              {fieldErrors.fromUserId?.map((message) => (
                <p key={message} className="text-xs text-destructive">
                  {message}
                </p>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="toUserId">To (creditor)</Label>
              <select
                id="toUserId"
                className={selectClassName}
                value={selectedToUserId}
                onChange={(event) => setToUserId(event.target.value)}
                disabled={pending}
                required
              >
                {allowedTo.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name}
                    {member.userId === data.currentUserId ? " (you)" : ""}
                  </option>
                ))}
              </select>
              {fieldErrors.toUserId?.map((message) => (
                <p key={message} className="text-xs text-destructive">
                  {message}
                </p>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount (BDT)</Label>
              <Input
                id="amount"
                name="amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                disabled={pending}
                required
              />
              {fieldErrors.amount?.map((message) => (
                <p key={message} className="text-xs text-destructive">
                  {message}
                </p>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="method">Payment method</Label>
              <select
                id="method"
                className={selectClassName}
                value={method}
                onChange={(event) =>
                  setMethod(event.target.value as SettlementMethod)
                }
                disabled={pending}
              >
                <option value="BKASH">bKash (manual transfer)</option>
                <option value="CASH">Cash</option>
                <option value="BANK">Bank</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="transactionReference">
                Transaction reference (optional)
              </Label>
              <Input
                id="transactionReference"
                name="transactionReference"
                placeholder="e.g. bKash transaction ID"
                value={transactionReference}
                onChange={(event) =>
                  setTransactionReference(event.target.value)
                }
                disabled={pending}
                maxLength={120}
              />
              {fieldErrors.transactionReference?.map((message) => (
                <p key={message} className="text-xs text-destructive">
                  {message}
                </p>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="note">Note (optional)</Label>
              <Input
                id="note"
                name="note"
                placeholder="What was this payment for?"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                disabled={pending}
                maxLength={500}
              />
              {fieldErrors.note?.map((message) => (
                <p key={message} className="text-xs text-destructive">
                  {message}
                </p>
              ))}
            </div>

            {method === "BKASH" && (
              <p className="text-xs text-muted-foreground sm:col-span-2">
                bKash transfers happen outside FairShare. This form does not
                verify a bKash transaction and does not contact bKash.
              </p>
            )}

            {serverError && (
              <p
                role="alert"
                className="text-sm text-destructive sm:col-span-2"
              >
                {serverError}
              </p>
            )}

            <div className="sm:col-span-2">
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                {pending ? "Recording..." : "Record settlement"}
              </Button>
            </div>
          </form>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="settlement-history-heading">
        <h3 id="settlement-history-heading" className="text-sm font-semibold">
          Settlement history
        </h3>

        {data.history.length === 0 ? (
          <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            No settlements have been recorded yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.history.map((item) => (
              <SettlementHistoryRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SettlementHistoryRow({ item }: { item: SettlementHistoryItem }) {
  return (
    <li className="rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate font-medium">{item.fromName}</span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{item.toName}</span>
          <Badge variant="outline">
            {SETTLEMENT_METHOD_LABELS[item.method]}
          </Badge>
        </div>
        <span className="shrink-0 font-mono text-sm font-medium">
          {formatPoisha(parseMoneyToPoisha(item.amount))}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Recorded by {item.recordedByName} · {item.settledAtLabel}
      </p>
      {item.transactionReference && (
        <p className="text-xs text-muted-foreground">
          Reference: {item.transactionReference}
        </p>
      )}
      {item.note && (
        <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
      )}
    </li>
  );
}

