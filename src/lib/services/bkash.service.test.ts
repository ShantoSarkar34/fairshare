import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BkashApiError,
  BkashConfigurationError,
  clearBkashTokenCache,
  createBkashPayment,
  executeBkashPayment,
  getBkashAccessToken,
  queryBkashPayment,
} from "@/lib/services/bkash.service";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

function textResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as Response;
}

async function primeToken(): Promise<void> {
  fetchMock.mockResolvedValueOnce(
    jsonResponse({
      id_token: "access-token",
      expires_in: 3600,
      statusCode: "0000",
    }),
  );
  await getBkashAccessToken();
}

beforeEach(() => {
  vi.clearAllMocks();
  clearBkashTokenCache();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("BKASH_ENV", "sandbox");
  vi.stubEnv(
    "BKASH_BASE_URL",
    "https://tokenized.sandbox.bka.sh/v1.2.0-beta",
  );
  vi.stubEnv("BKASH_USERNAME", "sandbox-user");
  vi.stubEnv("BKASH_PASSWORD", "sandbox-password");
  vi.stubEnv("BKASH_APP_KEY", "sandbox-key");
  vi.stubEnv("BKASH_APP_SECRET", "sandbox-secret");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  clearBkashTokenCache();
});

describe("bKash access token", () => {
  it("requests and caches a sandbox token", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        id_token: "access-token",
        expires_in: 3600,
        statusCode: "0000",
      }),
    );

    await expect(getBkashAccessToken()).resolves.toBe("access-token");
    await expect(getBkashAccessToken()).resolves.toBe("access-token");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout/token/grant",
    );

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Accept: "application/json",
      username: "sandbox-user",
      password: "sandbox-password",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      app_key: "sandbox-key",
      app_secret: "sandbox-secret",
    });
  });

  it("rejects a token request with an HTTP error", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { statusCode: "0001", statusMessage: "Invalid credentials" },
        401,
      ),
    );

    await expect(getBkashAccessToken()).rejects.toBeInstanceOf(BkashApiError);
  });

  it("rejects a token response with a bKash error status", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ statusCode: "0001", statusMessage: "Invalid app" }),
    );

    await expect(getBkashAccessToken()).rejects.toMatchObject({
      name: "BkashApiError",
      statusCode: "0001",
    });
  });

  it("rejects invalid JSON without exposing the body", async () => {
    fetchMock.mockResolvedValue(textResponse("<html>bad gateway</html>"));

    await expect(getBkashAccessToken()).rejects.toMatchObject({
      name: "BkashApiError",
      message: "bKash returned an invalid JSON response",
    });
  });

  it("fails safely when a required environment variable is missing", async () => {
    vi.stubEnv("BKASH_APP_KEY", "");

    await expect(getBkashAccessToken()).rejects.toBeInstanceOf(
      BkashConfigurationError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a non-sandbox base URL", async () => {
    vi.stubEnv(
      "BKASH_BASE_URL",
      "https://tokenized.pay.bka.sh/v1.2.0-beta",
    );

    await expect(getBkashAccessToken()).rejects.toThrow("sandbox host");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays disabled unless explicitly enabled", async () => {
    vi.stubEnv("BKASH_ENV", "production");

    await expect(getBkashAccessToken()).rejects.toThrow("disabled");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports timeouts as uncertain", async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new Error("timed out"), { name: "TimeoutError" }),
    );

    await expect(getBkashAccessToken()).rejects.toMatchObject({
      name: "BkashApiError",
      uncertain: true,
    });
  });
});

describe("bKash checkout API", () => {
  it("creates a payment with integer poisha converted to a decimal string", async () => {
    await primeToken();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        statusCode: "0000",
        paymentID: "payment_1",
        bkashURL: "https://sandbox.bka.sh/checkout/payment_1",
      }),
    );

    await expect(
      createBkashPayment({
        amount: 10_000n,
        merchantInvoiceNumber: "FS-1",
        payerReference: "user_1",
      }),
    ).resolves.toEqual({
      paymentID: "payment_1",
      bkashURL: "https://sandbox.bka.sh/checkout/payment_1",
    });

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(
      "https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout/create",
    );
    expect(init.headers).toMatchObject({
      Authorization: "access-token",
      "X-APP-Key": "sandbox-key",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      mode: "0011",
      payerReference: "user_1",
      callbackURL: "http://localhost:3000/api/bkash/callback",
      amount: "100.00",
      currency: "BDT",
      intent: "sale",
      merchantInvoiceNumber: "FS-1",
    });
  });

  it("rejects a failed create response", async () => {
    await primeToken();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        statusCode: "0001",
        statusMessage: "Create failed",
      }),
    );

    await expect(
      createBkashPayment({
        amount: 10_000n,
        merchantInvoiceNumber: "FS-1",
        payerReference: "user_1",
      }),
    ).rejects.toThrow("Create failed");
  });

  it("rejects an untrusted checkout URL", async () => {
    await primeToken();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        statusCode: "0000",
        paymentID: "payment_1",
        bkashURL: "https://evil.example/checkout",
      }),
    );

    await expect(
      createBkashPayment({
        amount: 10_000n,
        merchantInvoiceNumber: "FS-1",
        payerReference: "user_1",
      }),
    ).rejects.toThrow("untrusted checkout URL");
  });

  it("rejects a production bKash checkout URL", async () => {
    await primeToken();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        statusCode: "0000",
        paymentID: "payment_1",
        bkashURL: "https://checkout.pay.bka.sh/checkout/payment_1",
      }),
    );

    await expect(
      createBkashPayment({
        amount: 10_000n,
        merchantInvoiceNumber: "FS-1",
        payerReference: "user_1",
      }),
    ).rejects.toThrow("untrusted checkout URL");
  });

  it("refreshes an expired token once and retries the request", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ id_token: "old-token", statusCode: "0000" }),
      )
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(
        jsonResponse({ id_token: "new-token", statusCode: "0000" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          statusCode: "0000",
          paymentID: "payment_1",
          bkashURL: "https://sandbox.bka.sh/checkout/payment_1",
        }),
      );

    await expect(
      createBkashPayment({
        amount: 10_000n,
        merchantInvoiceNumber: "FS-1",
        payerReference: "user_1",
      }),
    ).resolves.toMatchObject({ paymentID: "payment_1" });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const retryHeaders = fetchMock.mock.calls[3]?.[1] as RequestInit;
    expect(retryHeaders.headers).toMatchObject({
      Authorization: "new-token",
    });
  });

  it("executes a payment and validates the response shape", async () => {
    await primeToken();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        statusCode: "0000",
        paymentID: "payment_1",
        trxID: "TRX1",
        transactionStatus: "Completed",
        amount: "100.00",
        currency: "BDT",
        merchantInvoiceNumber: "FS-1",
      }),
    );

    await expect(executeBkashPayment("payment_1")).resolves.toMatchObject({
      paymentID: "payment_1",
      trxID: "TRX1",
      transactionStatus: "Completed",
      amount: "100.00",
      currency: "BDT",
    });

    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout/execute",
    );
  });

  it("rejects a failed execute response", async () => {
    await primeToken();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ statusCode: "0001", statusMessage: "Execute failed" }),
    );

    await expect(executeBkashPayment("payment_1")).rejects.toBeInstanceOf(
      BkashApiError,
    );
  });

  it("queries a payment status", async () => {
    await primeToken();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        statusCode: "0000",
        paymentID: "payment_1",
        trxID: "TRX1",
        transactionStatus: "Completed",
        amount: "100.00",
        currency: "BDT",
      }),
    );

    await expect(queryBkashPayment("payment_1")).resolves.toMatchObject({
      transactionStatus: "Completed",
      trxID: "TRX1",
    });

    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout/payment/status",
    );
  });

  it("rejects a failed query response", async () => {
    await primeToken();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ statusCode: "0002", statusMessage: "Query failed" }),
    );

    await expect(queryBkashPayment("payment_1")).rejects.toBeInstanceOf(
      BkashApiError,
    );
  });

  it("marks a create timeout as uncertain", async () => {
    await primeToken();
    fetchMock.mockRejectedValue(
      Object.assign(new Error("timed out"), { name: "TimeoutError" }),
    );

    await expect(
      createBkashPayment({
        amount: 10_000n,
        merchantInvoiceNumber: "FS-1",
        payerReference: "user_1",
      }),
    ).rejects.toMatchObject({ uncertain: true });
  });
});
