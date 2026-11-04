"use client";

import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  checkBkashPaymentStatusAction,
  createBkashCheckoutAction,
} from "@/app/(dashboard)/groups/[groupId]/bkash-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BKASH_STATUS_LABELS } from "@/lib/bkash/display";
import type {
  BkashPaymentStatus,
  BkashPaymentView,
  BkashSandboxData,
} from "@/lib/bkash/types";
import { formatPoisha, parseMoneyToPoisha } from "@/lib/money";

export function BkashSandboxPanel({
  groupId,
  data,
}: {
  groupId: string;
  data: BkashSandboxData;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      const poisha = parseMoneyToPoisha(amount);
      if (poisha <= 0n) {
        setError("Amount must be greater than zero");
        return;
      }
    } catch (parseError) {
      setError(
        parseError instanceof Error
          ? parseError.message
          : "Enter a valid amount",
      );
      return;
    }

    setPending(true);

    try {
      const result = await createBkashCheckoutAction(groupId, amount);

      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      window.location.assign(result.data.checkoutUrl);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleCheckStatus(paymentId: string) {
    setCheckingId(paymentId);

    try {
      const result = await checkBkashPaymentStatusAction(groupId, paymentId);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(
        `Payment status: ${BKASH_STATUS_LABELS[result.data.payment.status]}`,
      );
      router.refresh();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setCheckingId(null);
    }
  }

  if (!data.enabled) {
    return (
      <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
        bKash sandbox checkout is disabled. Set{" "}
        <code className="rounded bg-muted px-1 py-0.5">BKASH_ENV=sandbox</code>{" "}
        and configure the sandbox credentials to enable this demo.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleCheckout} className="space-y-3 rounded-lg border p-3">
        <div className="space-y-1.5">
          <Label htmlFor="bkash-amount">Test payment amount (BDT)</Label>
          <Input
            id="bkash-amount"
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            disabled={pending}
            required
          />
          <p className="text-xs text-muted-foreground">
            Use a small test amount. FairShare creates a local payment record
            before opening the hosted bKash sandbox checkout.
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ExternalLink className="size-4" />
          )}
          {pending ? "Starting checkout..." : "Start sandbox checkout"}
        </Button>
      </form>

      <section className="space-y-3" aria-labelledby="bkash-payments-heading">
        <div>
          <h3 id="bkash-payments-heading" className="text-sm font-semibold">
            Your sandbox checkout history
          </h3>
          <p className="text-xs text-muted-foreground">
            These are merchant checkout records, not member-to-member
            settlements.
          </p>
        </div>

        {data.payments.length === 0 ? (
          <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            No sandbox checkouts have been started yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.payments.map((payment) => (
              <BkashPaymentRow
                key={payment.id}
                payment={payment}
                checking={checkingId === payment.id}
                onCheckStatus={() => handleCheckStatus(payment.id)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function BkashPaymentRow({
  payment,
  checking,
  onCheckStatus,
}: {
  payment: BkashPaymentView;
  checking: boolean;
  onCheckStatus: () => void;
}) {
  const canCheckStatus =
    payment.status === "PENDING" ||
    payment.status === "INITIATED" ||
    payment.status === "UNKNOWN";

  return (
    <li className="rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-medium">
              {formatPoisha(parseMoneyToPoisha(payment.amount))}
            </span>
            <StatusBadge status={payment.status} />
          </div>
          <p className="mt-1 break-all text-xs text-muted-foreground">
            Invoice: {payment.merchantInvoiceNumber}
          </p>
          {payment.trxID && (
            <p className="break-all text-xs text-muted-foreground">
              bKash transaction ID: {payment.trxID}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Created {payment.createdAtLabel}
            {payment.completedAtLabel
              ? ` · Completed ${payment.completedAtLabel}`
              : ""}
          </p>
          {payment.failureReason && (
            <p className="mt-1 text-xs text-muted-foreground">
              {payment.failureReason}
            </p>
          )}
        </div>

        {canCheckStatus && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCheckStatus}
            disabled={checking}
          >
            {checking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {checking ? "Checking..." : "Check status"}
          </Button>
        )}
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: BkashPaymentStatus }) {
  if (status === "COMPLETED") {
    return (
      <Badge variant="outline" className="border-success/40 text-success">
        {BKASH_STATUS_LABELS[status]}
      </Badge>
    );
  }

  if (status === "FAILED") {
    return <Badge variant="destructive">{BKASH_STATUS_LABELS[status]}</Badge>;
  }

  if (status === "UNKNOWN") {
    return (
      <Badge variant="outline" className="border-amber-500/40 text-amber-700">
        {BKASH_STATUS_LABELS[status]}
      </Badge>
    );
  }

  return <Badge variant="outline">{BKASH_STATUS_LABELS[status]}</Badge>;
}
