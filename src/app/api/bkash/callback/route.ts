import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth/session";
import {
  findBkashPaymentForCallback,
  reconcileBkashPayment,
} from "@/lib/services/bkash-payment.service";

// Route Handlers that read the request/session are dynamic under Cache
// Components; an explicit `dynamic = "force-dynamic"` is rejected by Next 16.
const paymentIdSchema = z.string().trim().min(1).max(200);

function callbackStatusFrom(value: string | null): "success" | "failure" | "cancel" | undefined {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "success" || normalized === "completed") {
    return "success";
  }

  if (normalized === "cancel" || normalized === "cancelled") {
    return "cancel";
  }

  if (normalized === "failure" || normalized === "failed") {
    return "failure";
  }

  return undefined;
}

/**
 * bKash redirects the browser here after hosted checkout.
 *
 * Query parameters are never trusted as proof of payment. The local payment is
 * matched to the authenticated user, then execute/query calls decide whether
 * the payment can be completed.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const session = await getSession();

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const paymentIdResult = paymentIdSchema.safeParse(
    url.searchParams.get("paymentID") ??
      url.searchParams.get("paymentId"),
  );

  if (!paymentIdResult.success) {
    return NextResponse.redirect(new URL("/groups?bkash=invalid", request.url));
  }

  const localPayment = await findBkashPaymentForCallback(
    paymentIdResult.data,
    session.user.id,
  );

  if (!localPayment) {
    return NextResponse.redirect(new URL("/groups?bkash=invalid", request.url));
  }

  try {
    const payment = await reconcileBkashPayment(localPayment.id, {
      callbackStatus: callbackStatusFrom(url.searchParams.get("status")),
    });

    return NextResponse.redirect(
      new URL(
        `/groups/${localPayment.groupId}?bkash=${payment.status.toLowerCase()}`,
        request.url,
      ),
    );
  } catch (error) {
    console.error(
      "bKash callback reconciliation failed:",
      error instanceof Error ? error.message : "unknown error",
    );

    return NextResponse.redirect(
      new URL(
        `/groups/${localPayment.groupId}?bkash=error`,
        request.url,
      ),
    );
  }
}
