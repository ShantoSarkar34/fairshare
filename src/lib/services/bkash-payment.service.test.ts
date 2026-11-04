import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class BkashApiError extends Error {
    readonly uncertain: boolean;
    readonly statusCode?: string;
    readonly httpStatus?: number;

    constructor(
      message: string,
      options: {
        uncertain: boolean;
        statusCode?: string;
        httpStatus?: number;
      },
    ) {
      super(message);
      this.name = "BkashApiError";
      this.uncertain = options.uncertain;
      this.statusCode = options.statusCode;
      this.httpStatus = options.httpStatus;
    }
  }

  class BkashConfigurationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "BkashConfigurationError";
    }
  }

  return {
    requireMembership: vi.fn(),
    isBkashSandboxEnabled: vi.fn(),
    assertBkashSandboxConfigured: vi.fn(),
    createBkashPayment: vi.fn(),
    executeBkashPayment: vi.fn(),
    queryBkashPayment: vi.fn(),
    BkashApiError,
    BkashConfigurationError,
    prisma: {
      bkashPayment: {
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      settlement: {
        create: vi.fn(),
      },
      $queryRaw: vi.fn(),
      $transaction: vi.fn(),
    },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/services/group-access", () => ({
  requireMembership: mocks.requireMembership,
}));
vi.mock("@/lib/services/bkash.service", () => ({
  BkashApiError: mocks.BkashApiError,
  BkashConfigurationError: mocks.BkashConfigurationError,
  assertBkashSandboxConfigured: mocks.assertBkashSandboxConfigured,
  createBkashPayment: mocks.createBkashPayment,
  executeBkashPayment: mocks.executeBkashPayment,
  isBkashSandboxEnabled: mocks.isBkashSandboxEnabled,
  queryBkashPayment: mocks.queryBkashPayment,
}));

import {
  checkBkashPaymentStatus,
  createBkashCheckout,
  getBkashSandboxOverview,
  reconcileBkashPayment,
} from "@/lib/services/bkash-payment.service";
import { NotFoundError } from "@/lib/errors";

const GROUP_ID = "group_1";
const USER_ID = "user_1";
const LOCAL_ID = "local_1";
const BKASH_PAYMENT_ID = "bkash_payment_1";
const INVOICE = "FS-123";

type LocalPayment = {
  id: string;
  groupId: string;
  userId: string;
  amount: bigint;
  currency: string;
  merchantInvoiceNumber: string;
  paymentID: string | null;
  trxID: string | null;
  status: "PENDING" | "INITIATED" | "COMPLETED" | "FAILED" | "CANCELLED" | "UNKNOWN";
  payerReference: string | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

let localPayment: LocalPayment;

function makeLocalPayment(overrides: Partial<LocalPayment> = {}): LocalPayment {
  return {
    id: LOCAL_ID,
    groupId: GROUP_ID,
    userId: USER_ID,
    amount: 10_000n,
    currency: "BDT",
    merchantInvoiceNumber: INVOICE,
    paymentID: BKASH_PAYMENT_ID,
    trxID: null,
    status: "INITIATED",
    payerReference: USER_ID,
    failureReason: null,
    createdAt: new Date(Date.UTC(2026, 10, 4, 10, 0)),
    updatedAt: new Date(Date.UTC(2026, 10, 4, 10, 0)),
    completedAt: null,
    ...overrides,
  };
}

function applyUpdate(data: Record<string, unknown>): void {
  if (typeof data.status === "string") {
    localPayment.status = data.status as LocalPayment["status"];
  }
  if ("paymentID" in data) {
    localPayment.paymentID = (data.paymentID as string | null) ?? null;
  }
  if ("trxID" in data) {
    localPayment.trxID = (data.trxID as string | null) ?? null;
  }
  if ("failureReason" in data) {
    localPayment.failureReason =
      (data.failureReason as string | null) ?? null;
  }
  if ("completedAt" in data) {
    localPayment.completedAt = (data.completedAt as Date | null) ?? null;
  }
  localPayment.updatedAt = new Date();
}

function transactionResult(
  overrides: Partial<{
    paymentID: string | null;
    trxID: string | null;
    transactionStatus: string | null;
    amount: string | null;
    currency: string | null;
    merchantInvoiceNumber: string | null;
    statusCode: string | null;
    statusMessage: string | null;
  }> = {},
) {
  return {
    paymentID: BKASH_PAYMENT_ID,
    trxID: "TRX_1",
    transactionStatus: "Completed",
    amount: "100.00",
    currency: "BDT",
    merchantInvoiceNumber: INVOICE,
    statusCode: "0000",
    statusMessage: null,
    ...overrides,
  };
}

function installPrismaMocks(): void {
  mocks.prisma.bkashPayment.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) =>
      where.id === localPayment.id ? { ...localPayment } : null,
  );
  mocks.prisma.bkashPayment.findUniqueOrThrow.mockImplementation(
    async ({ where }: { where: { id: string } }) => {
      if (where.id !== localPayment.id) throw new Error("not found");
      return { ...localPayment };
    },
  );
  mocks.prisma.bkashPayment.update.mockImplementation(
    async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => {
      if (where.id !== localPayment.id) throw new Error("not found");
      applyUpdate(data);
      return { ...localPayment };
    },
  );
  mocks.prisma.bkashPayment.updateMany.mockImplementation(
    async ({
      where,
      data,
    }: {
      where: { id: string; status?: { not?: string } };
      data: Record<string, unknown>;
    }) => {
      if (where.id !== localPayment.id) return { count: 0 };
      if (
        where.status?.not &&
        localPayment.status === where.status.not
      ) {
        return { count: 0 };
      }
      applyUpdate(data);
      return { count: 1 };
    },
  );
  mocks.prisma.bkashPayment.findMany.mockImplementation(async () => [
    { ...localPayment },
  ]);
  mocks.prisma.bkashPayment.findFirst.mockImplementation(
    async ({
      where,
    }: {
      where: { id?: string; groupId?: string; userId?: string };
    }) => {
      if (where.id && where.id !== localPayment.id) return null;
      if (where.groupId && where.groupId !== localPayment.groupId) return null;
      if (where.userId && where.userId !== localPayment.userId) return null;
      return { id: localPayment.id, groupId: localPayment.groupId };
    },
  );
  mocks.prisma.bkashPayment.create.mockResolvedValue({ id: LOCAL_ID });
  mocks.prisma.$queryRaw.mockResolvedValue([]);
  mocks.prisma.$transaction.mockImplementation(
    async (callback: (tx: typeof mocks.prisma) => unknown) =>
      callback(mocks.prisma),
  );
  mocks.prisma.settlement.create.mockResolvedValue({ id: "settlement_1" });
}

beforeEach(() => {
  vi.clearAllMocks();
  localPayment = makeLocalPayment();
  installPrismaMocks();
  mocks.requireMembership.mockResolvedValue({ id: "membership_1", role: "MEMBER" });
  mocks.isBkashSandboxEnabled.mockReturnValue(true);
  mocks.assertBkashSandboxConfigured.mockImplementation(() => {});
});

describe("createBkashCheckout", () => {
  it("creates a local pending record and returns only the checkout URL", async () => {
    mocks.createBkashPayment.mockResolvedValue({
      paymentID: BKASH_PAYMENT_ID,
      bkashURL: "https://sandbox.bka.sh/checkout/1",
    });

    const result = await createBkashCheckout(GROUP_ID, USER_ID, 10_000n);

    expect(result).toEqual({
      paymentId: LOCAL_ID,
      checkoutUrl: "https://sandbox.bka.sh/checkout/1",
    });
    expect(mocks.requireMembership).toHaveBeenCalledWith(GROUP_ID, USER_ID);

    const createCall = mocks.prisma.bkashPayment.create.mock.calls[0]?.[0] as {
      data: {
        groupId: string;
        userId: string;
        amount: bigint;
        status: string;
        merchantInvoiceNumber: string;
        payerReference: string;
      };
    };
    expect(createCall.data).toMatchObject({
      groupId: GROUP_ID,
      userId: USER_ID,
      amount: 10_000n,
      status: "PENDING",
      payerReference: USER_ID,
    });
    expect(createCall.data.merchantInvoiceNumber).toMatch(/^FS-\d+-[a-f0-9]{12}$/);

    expect(mocks.prisma.bkashPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: LOCAL_ID },
        data: expect.objectContaining({
          paymentID: BKASH_PAYMENT_ID,
          status: "INITIATED",
        }),
      }),
    );
    expect(mocks.prisma.settlement.create).not.toHaveBeenCalled();
  });

  it("marks a deterministic create failure as FAILED", async () => {
    mocks.createBkashPayment.mockRejectedValue(
      new mocks.BkashApiError("Create failed", { uncertain: false }),
    );

    await expect(
      createBkashCheckout(GROUP_ID, USER_ID, 10_000n),
    ).rejects.toThrow("Create failed");

    expect(mocks.prisma.bkashPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });

  it("marks an uncertain create failure as UNKNOWN", async () => {
    mocks.createBkashPayment.mockRejectedValue(
      new mocks.BkashApiError("Timed out", { uncertain: true }),
    );

    await expect(
      createBkashCheckout(GROUP_ID, USER_ID, 10_000n),
    ).rejects.toThrow("Timed out");

    expect(mocks.prisma.bkashPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "UNKNOWN" }),
      }),
    );
  });

  it("fails safely when the sandbox is not configured", async () => {
    mocks.assertBkashSandboxConfigured.mockImplementation(() => {
      throw new mocks.BkashConfigurationError("Missing sandbox configuration");
    });

    await expect(
      createBkashCheckout(GROUP_ID, USER_ID, 10_000n),
    ).rejects.toThrow("Missing sandbox configuration");

    expect(mocks.prisma.bkashPayment.create).not.toHaveBeenCalled();
    expect(mocks.createBkashPayment).not.toHaveBeenCalled();
  });

  it("rejects a non-positive amount before creating a record", async () => {
    await expect(
      createBkashCheckout(GROUP_ID, USER_ID, 0n),
    ).rejects.toThrow("valid positive amount");

    expect(mocks.prisma.bkashPayment.create).not.toHaveBeenCalled();
  });
});

describe("bKash sandbox overview", () => {
  it("rejects a non-member before returning payment data", async () => {
    mocks.requireMembership.mockRejectedValue(new NotFoundError("Not found"));

    await expect(
      getBkashSandboxOverview(GROUP_ID, USER_ID),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mocks.prisma.bkashPayment.findMany).not.toHaveBeenCalled();
  });

  it("returns disabled without requiring credentials", async () => {
    mocks.isBkashSandboxEnabled.mockReturnValue(false);

    const result = await getBkashSandboxOverview(GROUP_ID, USER_ID);

    expect(result).toEqual({
      ok: true,
      data: { enabled: false, currentUserId: USER_ID, payments: [] },
    });
    expect(mocks.assertBkashSandboxConfigured).not.toHaveBeenCalled();
  });

  it("returns a safe configuration error", async () => {
    mocks.assertBkashSandboxConfigured.mockImplementation(() => {
      throw new mocks.BkashConfigurationError("Missing BKASH_APP_KEY");
    });

    const result = await getBkashSandboxOverview(GROUP_ID, USER_ID);

    expect(result).toEqual({ ok: false, error: "Missing BKASH_APP_KEY" });
  });

  it("returns only the current user's payment records", async () => {
    const result = await getBkashSandboxOverview(GROUP_ID, USER_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.enabled).toBe(true);
    expect(result.data.payments).toHaveLength(1);
    expect(result.data.payments[0]).toMatchObject({
      id: LOCAL_ID,
      status: "INITIATED",
      amount: "100.00",
      merchantInvoiceNumber: INVOICE,
    });
    expect(mocks.prisma.bkashPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { groupId: GROUP_ID, userId: USER_ID } }),
    );
  });
});

describe("reconcileBkashPayment", () => {
  it("completes a verified callback and never creates a Settlement", async () => {
    mocks.executeBkashPayment.mockResolvedValue(transactionResult());

    const result = await reconcileBkashPayment(LOCAL_ID, {
      callbackStatus: "success",
    });

    expect(result.status).toBe("COMPLETED");
    expect(result.trxID).toBe("TRX_1");
    expect(result.completedAt).not.toBeNull();
    expect(mocks.executeBkashPayment).toHaveBeenCalledWith(BKASH_PAYMENT_ID);
    expect(mocks.queryBkashPayment).not.toHaveBeenCalled();
    expect(mocks.prisma.settlement.create).not.toHaveBeenCalled();
  });

  it("does not complete a payment when the amount differs", async () => {
    mocks.executeBkashPayment.mockResolvedValue(
      transactionResult({ amount: "101.00" }),
    );

    const result = await reconcileBkashPayment(LOCAL_ID, {
      callbackStatus: "success",
    });

    expect(result.status).toBe("UNKNOWN");
    expect(result.failureReason).toContain("amount");
  });

  it("does not complete a payment when the currency differs", async () => {
    mocks.executeBkashPayment.mockResolvedValue(
      transactionResult({ currency: "USD" }),
    );

    const result = await reconcileBkashPayment(LOCAL_ID, {
      callbackStatus: "success",
    });

    expect(result.status).toBe("UNKNOWN");
    expect(result.failureReason).toContain("BDT");
  });

  it("does not complete a payment when the paymentID differs", async () => {
    mocks.executeBkashPayment.mockResolvedValue(
      transactionResult({ paymentID: "other_payment" }),
    );

    const result = await reconcileBkashPayment(LOCAL_ID, {
      callbackStatus: "success",
    });

    expect(result.status).toBe("UNKNOWN");
    expect(result.failureReason).toContain("payment id");
  });

  it("requires a transaction id before completing", async () => {
    mocks.executeBkashPayment.mockResolvedValue(
      transactionResult({ trxID: null }),
    );

    const result = await reconcileBkashPayment(LOCAL_ID, {
      callbackStatus: "success",
    });

    expect(result.status).toBe("UNKNOWN");
    expect(result.failureReason).toContain("transaction id");
  });

  it("does not let a browser success hint override a failed bKash result", async () => {
    mocks.executeBkashPayment.mockResolvedValue(
      transactionResult({ transactionStatus: "Failed", trxID: null }),
    );
    mocks.queryBkashPayment.mockResolvedValue(
      transactionResult({ transactionStatus: "Failed", trxID: null }),
    );

    const result = await reconcileBkashPayment(LOCAL_ID, {
      callbackStatus: "success",
    });

    expect(result.status).toBe("FAILED");
  });

  it("keeps an uncertain execute result UNKNOWN when the status query also fails", async () => {
    mocks.executeBkashPayment.mockRejectedValue(
      new mocks.BkashApiError("Timed out", { uncertain: true }),
    );
    mocks.queryBkashPayment.mockRejectedValue(
      new mocks.BkashApiError("Still unavailable", { uncertain: true }),
    );

    const result = await reconcileBkashPayment(LOCAL_ID, {
      callbackStatus: "success",
    });

    expect(result.status).toBe("UNKNOWN");
    expect(result.status).not.toBe("COMPLETED");
  });

  it("uses Query Payment to reconcile an execution timeout", async () => {
    mocks.executeBkashPayment.mockRejectedValue(
      new mocks.BkashApiError("Timed out", { uncertain: true }),
    );
    mocks.queryBkashPayment.mockResolvedValue(transactionResult());

    const result = await reconcileBkashPayment(LOCAL_ID, {
      callbackStatus: "success",
    });

    expect(result.status).toBe("COMPLETED");
    expect(mocks.queryBkashPayment).toHaveBeenCalledWith(BKASH_PAYMENT_ID);
  });

  it("does not execute the same payment twice across duplicate callbacks", async () => {
    mocks.executeBkashPayment.mockResolvedValue(transactionResult());

    const first = await reconcileBkashPayment(LOCAL_ID, {
      callbackStatus: "success",
    });
    const second = await reconcileBkashPayment(LOCAL_ID, {
      callbackStatus: "success",
    });

    expect(first.status).toBe("COMPLETED");
    expect(second.status).toBe("COMPLETED");
    expect(mocks.executeBkashPayment).toHaveBeenCalledOnce();
    expect(mocks.prisma.settlement.create).not.toHaveBeenCalled();
  });

  it("does not execute a duplicate callback after completion", async () => {
    localPayment = makeLocalPayment({
      status: "COMPLETED",
      trxID: "TRX_1",
      completedAt: new Date(Date.UTC(2026, 10, 4, 11, 0)),
    });
    installPrismaMocks();

    const result = await reconcileBkashPayment(LOCAL_ID, {
      callbackStatus: "success",
    });

    expect(result.status).toBe("COMPLETED");
    expect(mocks.executeBkashPayment).not.toHaveBeenCalled();
    expect(mocks.queryBkashPayment).not.toHaveBeenCalled();
  });

  it("reconciles a failure callback by querying instead of trusting redirect status", async () => {
    mocks.queryBkashPayment.mockResolvedValue(transactionResult());

    const result = await reconcileBkashPayment(LOCAL_ID, {
      callbackStatus: "failure",
    });

    expect(result.status).toBe("COMPLETED");
    expect(mocks.executeBkashPayment).not.toHaveBeenCalled();
  });

  it("marks an initiated payment as cancelled after a cancel callback", async () => {
    mocks.queryBkashPayment.mockResolvedValue(
      transactionResult({
        transactionStatus: "Initiated",
        trxID: null,
      }),
    );

    const result = await reconcileBkashPayment(LOCAL_ID, {
      callbackStatus: "cancel",
    });

    expect(result.status).toBe("CANCELLED");
  });

  it("keeps an initiated status on a manual status check", async () => {
    mocks.queryBkashPayment.mockResolvedValue(
      transactionResult({
        transactionStatus: "Initiated",
        trxID: null,
      }),
    );

    const result = await reconcileBkashPayment(LOCAL_ID);

    expect(result.status).toBe("INITIATED");
  });
});

describe("checkBkashPaymentStatus", () => {
  it("rejects a payment that does not belong to the current user", async () => {
    mocks.prisma.bkashPayment.findFirst.mockResolvedValue(null);

    await expect(
      checkBkashPaymentStatus(GROUP_ID, USER_ID, "other_local"),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mocks.queryBkashPayment).not.toHaveBeenCalled();
  });

  it("reconciles a payment owned by the current user", async () => {
    mocks.queryBkashPayment.mockResolvedValue(transactionResult());

    const result = await checkBkashPaymentStatus(GROUP_ID, USER_ID, LOCAL_ID);

    expect(result.status).toBe("COMPLETED");
    expect(mocks.prisma.bkashPayment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: LOCAL_ID, groupId: GROUP_ID, userId: USER_ID },
      }),
    );
  });
});
