import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createBkashCheckout: vi.fn(),
  checkBkashPaymentStatus: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/services/bkash-payment.service", () => ({
  createBkashCheckout: mocks.createBkashCheckout,
  checkBkashPaymentStatus: mocks.checkBkashPaymentStatus,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  checkBkashPaymentStatusAction,
  createBkashCheckoutAction,
} from "./bkash-actions";
import { ValidationError } from "@/lib/errors";

const GROUP_ID = "group_1";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "user_1" });
});

describe("createBkashCheckoutAction", () => {
  it("rejects unauthenticated requests before creating a checkout", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(createBkashCheckoutAction(GROUP_ID, "10")).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mocks.createBkashCheckout).not.toHaveBeenCalled();
  });

  it("returns an amount field error for invalid input", async () => {
    const result = await createBkashCheckoutAction(GROUP_ID, "0");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.amount).toBeDefined();
    expect(mocks.createBkashCheckout).not.toHaveBeenCalled();
  });

  it("passes the parsed poisha amount to the service", async () => {
    mocks.createBkashCheckout.mockResolvedValue({
      paymentId: "local_1",
      checkoutUrl: "https://sandbox.bka.sh/checkout/1",
    });

    const result = await createBkashCheckoutAction(GROUP_ID, "123.45");

    expect(result).toEqual({
      ok: true,
      data: {
        paymentId: "local_1",
        checkoutUrl: "https://sandbox.bka.sh/checkout/1",
      },
    });
    expect(mocks.createBkashCheckout).toHaveBeenCalledWith(
      GROUP_ID,
      "user_1",
      12_345n,
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/groups/${GROUP_ID}`);
  });

  it("returns a safe configuration error", async () => {
    mocks.createBkashCheckout.mockRejectedValue(
      new ValidationError("bKash sandbox is missing BKASH_APP_KEY"),
    );

    const result = await createBkashCheckoutAction(GROUP_ID, "10");

    expect(result).toEqual({
      ok: false,
      error: "bKash sandbox is missing BKASH_APP_KEY",
    });
  });
});

describe("checkBkashPaymentStatusAction", () => {
  it("rejects invalid ids", async () => {
    const result = await checkBkashPaymentStatusAction(GROUP_ID, "");

    expect(result).toEqual({ ok: false, error: "Invalid payment" });
    expect(mocks.checkBkashPaymentStatus).not.toHaveBeenCalled();
  });

  it("returns the reconciled payment", async () => {
    mocks.checkBkashPaymentStatus.mockResolvedValue({
      id: "local_1",
      status: "COMPLETED",
    });

    const result = await checkBkashPaymentStatusAction(
      GROUP_ID,
      "local_1",
    );

    expect(result.ok).toBe(true);
    expect(mocks.checkBkashPaymentStatus).toHaveBeenCalledWith(
      GROUP_ID,
      "user_1",
      "local_1",
    );
  });
});
