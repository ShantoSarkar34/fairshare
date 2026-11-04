import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma, type BkashPayment } from "@/generated/prisma/client";
import { formatBkashDateTime } from "@/lib/bkash/display";
import type {
  BkashCheckoutSession,
  BkashPaymentStatus,
  BkashPaymentView,
  BkashSandboxResult,
} from "@/lib/bkash/types";
import { prisma } from "@/lib/db/prisma";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { parseMoneyToPoisha, poishaToDecimalString } from "@/lib/money";
import {
  BkashApiError,
  BkashConfigurationError,
  assertBkashSandboxConfigured,
  createBkashPayment,
  executeBkashPayment,
  isBkashSandboxEnabled,
  queryBkashPayment,
  type BkashTransactionResult,
} from "@/lib/services/bkash.service";
import { requireMembership } from "@/lib/services/group-access";

type BkashTx = Prisma.TransactionClient;
type CallbackStatus = "success" | "failure" | "cancel";

const MAX_REASON_LENGTH = 300;
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

function safeReason(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.trim().slice(0, MAX_REASON_LENGTH) || undefined;
}

function toPaymentView(payment: BkashPayment): BkashPaymentView {
  return {
    id: payment.id,
    amount: poishaToDecimalString(payment.amount),
    currency: payment.currency,
    merchantInvoiceNumber: payment.merchantInvoiceNumber,
    paymentID: payment.paymentID,
    trxID: payment.trxID,
    status: payment.status,
    failureReason: payment.failureReason,
    createdAt: payment.createdAt.toISOString(),
    createdAtLabel: formatBkashDateTime(payment.createdAt.toISOString()),
    completedAt: payment.completedAt?.toISOString() ?? null,
    completedAtLabel: payment.completedAt
      ? formatBkashDateTime(payment.completedAt.toISOString())
      : null,
  };
}

function normalizeTransactionStatus(value: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

function isCompletedTransaction(transaction: BkashTransactionResult): boolean {
  return normalizeTransactionStatus(transaction.transactionStatus) === "completed";
}

function isFailedTransaction(transaction: BkashTransactionResult): boolean {
  return normalizeTransactionStatus(transaction.transactionStatus) === "failed";
}

function isCancelledTransaction(transaction: BkashTransactionResult): boolean {
  const status = normalizeTransactionStatus(transaction.transactionStatus);
  return status === "cancelled" || status === "canceled";
}

function isInitiatedTransaction(transaction: BkashTransactionResult): boolean {
  const status = normalizeTransactionStatus(transaction.transactionStatus);
  return status === "initiated" || status === "pending";
}

/**
 * A bKash response is only allowed to complete a local payment when every
 * server-side detail agrees with the record created before checkout started.
 */
function verifyCompletedTransaction(
  payment: BkashPayment,
  transaction: BkashTransactionResult,
): { ok: true; trxID: string } | { ok: false; reason: string } {
  if (!isCompletedTransaction(transaction)) {
    return { ok: false, reason: "bKash did not report a completed transaction" };
  }

  if (!transaction.paymentID || transaction.paymentID !== payment.paymentID) {
    return { ok: false, reason: "bKash payment id did not match" };
  }

  if (
    transaction.merchantInvoiceNumber &&
    transaction.merchantInvoiceNumber !== payment.merchantInvoiceNumber
  ) {
    return { ok: false, reason: "bKash invoice number did not match" };
  }

  if (!transaction.amount) {
    return { ok: false, reason: "bKash did not return a transaction amount" };
  }

  let transactionAmount: bigint;

  try {
    transactionAmount = parseMoneyToPoisha(transaction.amount);
  } catch {
    return { ok: false, reason: "bKash returned an invalid amount" };
  }

  if (transactionAmount !== payment.amount) {
    return { ok: false, reason: "bKash amount did not match the local payment" };
  }

  if (transaction.currency !== "BDT") {
    return { ok: false, reason: "bKash currency was not BDT" };
  }

  if (!transaction.trxID) {
    return { ok: false, reason: "bKash did not provide a transaction id" };
  }

  return { ok: true, trxID: transaction.trxID };
}

async function setPaymentStatus(
  tx: BkashTx,
  paymentId: string,
  status: BkashPaymentStatus,
  failureReason?: string,
): Promise<BkashPayment> {
  await tx.bkashPayment.updateMany({
    where: { id: paymentId, status: { not: "COMPLETED" } },
    data: {
      status,
      failureReason: safeReason(failureReason) ?? null,
    },
  });

  return tx.bkashPayment.findUniqueOrThrow({ where: { id: paymentId } });
}

async function completePayment(
  tx: BkashTx,
  paymentId: string,
  trxID: string,
): Promise<BkashPayment> {
  await tx.bkashPayment.updateMany({
    where: { id: paymentId, status: { not: "COMPLETED" } },
    data: {
      status: "COMPLETED",
      trxID,
      completedAt: new Date(),
      failureReason: null,
    },
  });

  return tx.bkashPayment.findUniqueOrThrow({ where: { id: paymentId } });
}

/**
 * Returns the current user's sandbox checkout records. A user can only see and
 * modify their own local payment records.
 */
export async function getBkashSandboxOverview(
  groupId: string,
  userId: string,
): Promise<BkashSandboxResult> {
  await requireMembership(groupId, userId);

  if (!isBkashSandboxEnabled()) {
    return {
      ok: true,
      data: { enabled: false, currentUserId: userId, payments: [] },
    };
  }

  try {
    assertBkashSandboxConfigured();
  } catch (error) {
    if (error instanceof BkashConfigurationError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  const payments = await prisma.bkashPayment.findMany({
    where: { groupId, userId },
    orderBy: { createdAt: "desc" },
  });

  return {
    ok: true,
    data: {
      enabled: true,
      currentUserId: userId,
      payments: payments.map(toPaymentView),
    },
  };
}

/**
 * Starts a separate sandbox merchant checkout. This never records a
 * member-to-member Settlement.
 */
export async function createBkashCheckout(
  groupId: string,
  userId: string,
  amount: bigint,
): Promise<BkashCheckoutSession> {
  await requireMembership(groupId, userId);
  assertBkashSandboxConfigured();

  if (amount <= 0n || amount > MAX_POSTGRES_BIGINT) {
    throw new ValidationError("Enter a valid positive amount");
  }

  const merchantInvoiceNumber = `FS-${Date.now()}-${randomUUID()
    .replace(/-/g, "")
    .slice(0, 12)}`;
  const payerReference = userId;

  const localPayment = await prisma.bkashPayment.create({
    data: {
      groupId,
      userId,
      amount,
      currency: "BDT",
      merchantInvoiceNumber,
      payerReference,
      status: "PENDING",
    },
    select: { id: true },
  });

  try {
    const created = await createBkashPayment({
      amount,
      merchantInvoiceNumber,
      payerReference,
    });

    await prisma.bkashPayment.update({
      where: { id: localPayment.id },
      data: {
        paymentID: created.paymentID,
        status: "INITIATED",
        failureReason: null,
      },
    });

    return {
      paymentId: localPayment.id,
      checkoutUrl: created.bkashURL,
    };
  } catch (error) {
    const uncertain = error instanceof BkashApiError ? error.uncertain : false;
    const message =
      error instanceof Error
        ? error.message
        : "bKash checkout could not be created";

    await prisma.bkashPayment.updateMany({
      where: { id: localPayment.id, status: "PENDING" },
      data: {
        status: uncertain ? "UNKNOWN" : "FAILED",
        failureReason: safeReason(message) ?? "bKash checkout failed",
      },
    });

    throw error;
  }
}

export async function findBkashPaymentForCallback(
  paymentID: string,
  userId: string,
): Promise<{ id: string; groupId: string } | null> {
  return prisma.bkashPayment.findFirst({
    where: { paymentID, userId },
    select: { id: true, groupId: true },
  });
}

export async function checkBkashPaymentStatus(
  groupId: string,
  userId: string,
  paymentId: string,
): Promise<BkashPaymentView> {
  await requireMembership(groupId, userId);

  if (!isBkashSandboxEnabled()) {
    throw new ValidationError("bKash sandbox checkout is disabled");
  }

  const payment = await prisma.bkashPayment.findFirst({
    where: { id: paymentId, groupId, userId },
    select: { id: true },
  });

  if (!payment) {
    throw new NotFoundError("Payment not found");
  }

  return reconcileBkashPayment(payment.id);
}

/**
 * Reconciles one local payment with bKash.
 *
 * A group/payment advisory lock serializes duplicate callbacks and status
 * checks. The lock is held while the external call runs; this is deliberate so
 * two concurrent callbacks cannot both execute the same payment.
 */
export async function reconcileBkashPayment(
  paymentId: string,
  options: { callbackStatus?: CallbackStatus } = {},
): Promise<BkashPaymentView> {
  const existing = await prisma.bkashPayment.findUnique({
    where: { id: paymentId },
  });

  if (!existing) {
    throw new NotFoundError("Payment not found");
  }

  if (existing.status === "COMPLETED") {
    return toPaymentView(existing);
  }

  if (!existing.paymentID) {
    return toPaymentView(existing);
  }

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${paymentId})::bigint)`;

      const payment = await tx.bkashPayment.findUnique({
        where: { id: paymentId },
      });

      if (!payment) {
        throw new NotFoundError("Payment not found");
      }

      if (payment.status === "COMPLETED") {
        return toPaymentView(payment);
      }

      if (!payment.paymentID) {
        return toPaymentView(payment);
      }

      // Repeated failure/cancel callbacks should not keep calling bKash.
      // A manual status check (no callback hint) may still query a terminal
      // local status so a stale failure can be reconciled.
      if (
        (payment.status === "FAILED" || payment.status === "CANCELLED") &&
        options.callbackStatus !== undefined &&
        options.callbackStatus !== "success"
      ) {
        return toPaymentView(payment);
      }

      const hint = options.callbackStatus;
      let transaction: BkashTransactionResult | null = null;
      let executeError: unknown = null;

      if (hint === "success") {
        try {
          transaction = await executeBkashPayment(payment.paymentID);
        } catch (error) {
          executeError = error;
        }

        if (!transaction || !isCompletedTransaction(transaction)) {
          try {
            transaction = await queryBkashPayment(payment.paymentID);
          } catch (queryError) {
            const uncertain =
              (executeError instanceof BkashApiError &&
                executeError.uncertain) ||
              (queryError instanceof BkashApiError && queryError.uncertain);
            const message =
              queryError instanceof Error
                ? queryError.message
                : "bKash execution result was uncertain";

            return toPaymentView(
              await setPaymentStatus(
                tx,
                payment.id,
                uncertain ? "UNKNOWN" : "FAILED",
                message,
              ),
            );
          }
        }
      } else {
        try {
          transaction = await queryBkashPayment(payment.paymentID);
        } catch (error) {
          const uncertain =
            !(error instanceof BkashApiError) || error.uncertain;
          const message =
            error instanceof Error
              ? error.message
              : "bKash status could not be checked";

          return toPaymentView(
            await setPaymentStatus(
              tx,
              payment.id,
              uncertain ? "UNKNOWN" : "FAILED",
              message,
            ),
          );
        }
      }

      if (!transaction) {
        return toPaymentView(
          await setPaymentStatus(
            tx,
            payment.id,
            "UNKNOWN",
            "bKash did not return a transaction result",
          ),
        );
      }

      if (isCompletedTransaction(transaction)) {
        const verification = verifyCompletedTransaction(payment, transaction);

        if (!verification.ok) {
          return toPaymentView(
            await setPaymentStatus(
              tx,
              payment.id,
              "UNKNOWN",
              verification.reason,
            ),
          );
        }

        try {
          return toPaymentView(
            await completePayment(tx, payment.id, verification.trxID),
          );
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            throw new ConflictError(
              "This bKash transaction is already linked to another payment",
            );
          }
          throw error;
        }
      }

      if (isFailedTransaction(transaction)) {
        return toPaymentView(
          await setPaymentStatus(
            tx,
            payment.id,
            "FAILED",
            transaction.statusMessage ?? "bKash reported a failed payment",
          ),
        );
      }

      if (isCancelledTransaction(transaction)) {
        return toPaymentView(
          await setPaymentStatus(
            tx,
            payment.id,
            "CANCELLED",
            transaction.statusMessage ?? "The bKash payment was cancelled",
          ),
        );
      }

      if (hint === "cancel") {
        return toPaymentView(
          await setPaymentStatus(
            tx,
            payment.id,
            "CANCELLED",
            "The bKash checkout was cancelled",
          ),
        );
      }

      if (hint === "failure") {
        return toPaymentView(
          await setPaymentStatus(
            tx,
            payment.id,
            "FAILED",
            transaction.statusMessage ?? "The bKash checkout failed",
          ),
        );
      }

      if (isInitiatedTransaction(transaction)) {
        return toPaymentView(
          await setPaymentStatus(
            tx,
            payment.id,
            executeError ? "UNKNOWN" : "INITIATED",
            executeError instanceof Error
              ? executeError.message
              : "bKash has not completed this payment yet",
          ),
        );
      }

      return toPaymentView(
        await setPaymentStatus(
          tx,
          payment.id,
          "UNKNOWN",
          "bKash returned an unrecognized payment status",
        ),
      );
    },
    { maxWait: 5_000, timeout: 100_000 },
  );
}
