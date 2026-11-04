import "server-only";

import { z } from "zod";

import { AppError } from "@/lib/errors";
import { poishaToDecimalString } from "@/lib/money";

const SANDBOX_HOST = "tokenized.sandbox.bka.sh";
const SANDBOX_PATH_PREFIX = "/v1.2.0-beta";
const SANDBOX_CHECKOUT_HOSTS = new Set(["sandbox.payment.bkash.com"]);
const REQUEST_TIMEOUT_MS = 30_000;
const TOKEN_EXPIRY_BUFFER_MS = 60_000;

const TOKEN_PATH = "/tokenized/checkout/token/grant";
const CREATE_PATH = "/tokenized/checkout/create";
const EXECUTE_PATH = "/tokenized/checkout/execute";
const QUERY_PATH = "/tokenized/checkout/payment/status";

export class BkashConfigurationError extends AppError {
  constructor(message: string) {
    super("VALIDATION", message);
    this.name = "BkashConfigurationError";
  }
}

export class BkashApiError extends AppError {
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
    super("CONFLICT", message);
    this.name = "BkashApiError";
    this.uncertain = options.uncertain;
    this.statusCode = options.statusCode;
    this.httpStatus = options.httpStatus;
  }
}

type BkashConfig = {
  baseUrl: string;
  username: string;
  password: string;
  appKey: string;
  appSecret: string;
  appBaseUrl: string;
};

type CachedToken = {
  token: string;
  expiresAt: number;
};

let cachedToken: CachedToken | null = null;
let inFlightTokenRequest: Promise<CachedToken> | null = null;

const apiResponseSchema = z.object({
  statusCode: z.union([z.string(), z.number()]).optional(),
  statusMessage: z.string().optional(),
  errorMessage: z.string().optional(),
  id_token: z.string().optional(),
  expires_in: z.union([z.string(), z.number()]).optional(),
  paymentID: z.string().optional(),
  bkashURL: z.string().optional(),
  trxID: z.string().optional(),
  transactionStatus: z.string().optional(),
  amount: z.string().optional(),
  currency: z.string().optional(),
  merchantInvoiceNumber: z.string().optional(),
  payerReference: z.string().optional(),
});

type ApiResponse = z.infer<typeof apiResponseSchema>;

const tokenResponseSchema = z.object({
  id_token: z.string().min(1),
  expires_in: z.union([z.string(), z.number()]).optional(),
  statusCode: z.union([z.string(), z.number()]).optional(),
  statusMessage: z.string().optional(),
});

export type BkashCreatePaymentResult = {
  paymentID: string;
  bkashURL: string;
};

export type BkashTransactionResult = {
  paymentID: string | null;
  trxID: string | null;
  transactionStatus: string | null;
  amount: string | null;
  currency: string | null;
  merchantInvoiceNumber: string | null;
  statusCode: string | null;
  statusMessage: string | null;
};

/** The sandbox is opt-in. Production credentials are never accepted. */
export function isBkashSandboxEnabled(): boolean {
  return process.env.BKASH_ENV?.trim().toLowerCase() === "sandbox";
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new BkashConfigurationError(
      `bKash sandbox is missing the ${name} environment variable`,
    );
  }

  return value;
}

function getBkashConfig(): BkashConfig {
  if (!isBkashSandboxEnabled()) {
    throw new BkashConfigurationError(
      "bKash sandbox checkout is disabled. Set BKASH_ENV=sandbox to enable it.",
    );
  }

  const rawBaseUrl = requiredEnv("BKASH_BASE_URL");
  let baseUrl: URL;

  try {
    baseUrl = new URL(rawBaseUrl);
  } catch {
    throw new BkashConfigurationError("BKASH_BASE_URL is not a valid URL");
  }

  if (baseUrl.protocol !== "https:") {
    throw new BkashConfigurationError("BKASH_BASE_URL must use https");
  }

  if (baseUrl.hostname !== SANDBOX_HOST) {
    throw new BkashConfigurationError(
      "BKASH_BASE_URL must point to the bKash sandbox host",
    );
  }

  if (!baseUrl.pathname.startsWith(SANDBOX_PATH_PREFIX)) {
    throw new BkashConfigurationError(
      "BKASH_BASE_URL must use the v1.2.0-beta checkout API",
    );
  }

  const appBaseUrlRaw = process.env.BETTER_AUTH_URL?.trim();

  if (!appBaseUrlRaw) {
    throw new BkashConfigurationError(
      "BETTER_AUTH_URL is required for the bKash callback URL",
    );
  }

  let appBaseUrl: URL;

  try {
    appBaseUrl = new URL(appBaseUrlRaw);
  } catch {
    throw new BkashConfigurationError("BETTER_AUTH_URL is not a valid URL");
  }

  if (appBaseUrl.protocol !== "http:" && appBaseUrl.protocol !== "https:") {
    throw new BkashConfigurationError(
      "BETTER_AUTH_URL must use http or https",
    );
  }

  return {
    baseUrl: baseUrl.toString().replace(/\/+$/, ""),
    username: requiredEnv("BKASH_USERNAME"),
    password: requiredEnv("BKASH_PASSWORD"),
    appKey: requiredEnv("BKASH_APP_KEY"),
    appSecret: requiredEnv("BKASH_APP_SECRET"),
    appBaseUrl: appBaseUrl.toString().replace(/\/+$/, ""),
  };
}

export function assertBkashSandboxConfigured(): void {
  getBkashConfig();
}

export function getBkashCallbackUrl(): string {
  return `${getBkashConfig().appBaseUrl}/api/bkash/callback`;
}

export function clearBkashTokenCache(): void {
  cachedToken = null;
  inFlightTokenRequest = null;
}

function statusCodeOf(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return undefined;
}

function safeApiMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;

  const record = data as Record<string, unknown>;
  const message = record.statusMessage ?? record.errorMessage;

  if (typeof message !== "string") return undefined;

  const trimmed = message.trim();
  return trimmed.length > 0 && trimmed.length <= 200 ? trimmed : undefined;
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

async function fetchBkash(
  url: string,
  init: RequestInit,
): Promise<ApiResponse> {
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new BkashApiError("bKash request timed out", {
        uncertain: true,
      });
    }

    throw new BkashApiError("Could not reach bKash", {
      uncertain: true,
    });
  }

  const text = await response.text();
  let data: unknown = {};

  if (text.trim() !== "") {
    try {
      data = JSON.parse(text);
    } catch {
      throw new BkashApiError("bKash returned an invalid JSON response", {
        uncertain: response.status >= 500,
        httpStatus: response.status,
      });
    }
  }

  if (!response.ok) {
    const apiMessage = safeApiMessage(data);
    const code = statusCodeOf((data as Record<string, unknown>)?.statusCode);

    throw new BkashApiError(
      apiMessage
        ? `bKash request failed: ${apiMessage}`
        : `bKash request failed with HTTP ${response.status}`,
      {
        uncertain: response.status >= 500,
        httpStatus: response.status,
        statusCode: code,
      },
    );
  }

  const parsed = apiResponseSchema.safeParse(data);

  if (!parsed.success) {
    throw new BkashApiError("bKash returned an unexpected response shape", {
      uncertain: false,
      httpStatus: response.status,
    });
  }

  return parsed.data;
}

function assertBkashSuccess(data: ApiResponse): void {
  if (data.statusCode === undefined) {
    throw new BkashApiError(
      "bKash response did not include a success status code",
      { uncertain: false },
    );
  }

  if (String(data.statusCode) !== "0000") {
    const code = String(data.statusCode);
    const message = safeApiMessage(data);
    throw new BkashApiError(
      message
        ? `bKash rejected the request: ${message}`
        : `bKash rejected the request (code ${code})`,
      { uncertain: false, statusCode: code },
    );
  }
}

function toTransactionResult(data: ApiResponse): BkashTransactionResult {
  return {
    paymentID: data.paymentID ?? null,
    trxID: data.trxID ?? null,
    transactionStatus: data.transactionStatus ?? null,
    amount: data.amount ?? null,
    currency: data.currency ?? null,
    merchantInvoiceNumber: data.merchantInvoiceNumber ?? null,
    statusCode: statusCodeOf(data.statusCode) ?? null,
    statusMessage: data.statusMessage ?? null,
  };
}

function hasSandboxHost(value: string): boolean {
  try {
    const url = new URL(value);

    if (url.protocol !== "https:") {
      return false;
    }

    // bKash currently serves hosted sandbox checkout from this domain.
    if (SANDBOX_CHECKOUT_HOSTS.has(url.hostname)) {
      return true;
    }

    return (
      url.hostname.endsWith(".bka.sh") && url.hostname.includes("sandbox")
    );
  } catch {
    return false;
  }
}

async function requestToken(config: BkashConfig): Promise<CachedToken> {
  const response = await fetchBkash(`${config.baseUrl}${TOKEN_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      username: config.username,
      password: config.password,
    },
    body: JSON.stringify({
      app_key: config.appKey,
      app_secret: config.appSecret,
    }),
  });

  if (
    response.statusCode !== undefined &&
    String(response.statusCode) !== "0000"
  ) {
    throw new BkashApiError(
      "bKash rejected the token request",
      { uncertain: false, statusCode: String(response.statusCode) },
    );
  }

  const parsed = tokenResponseSchema.safeParse(response);

  if (!parsed.success) {
    throw new BkashApiError("bKash returned an invalid token response", {
      uncertain: false,
    });
  }

  const expiresIn = Number(parsed.data.expires_in);
  const ttlSeconds =
    Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3_600;

  return {
    token: parsed.data.id_token,
    expiresAt: Date.now() + ttlSeconds * 1_000,
  };
}

export async function getBkashAccessToken(): Promise<string> {
  const config = getBkashConfig();

  if (
    cachedToken !== null &&
    cachedToken.expiresAt - TOKEN_EXPIRY_BUFFER_MS > Date.now()
  ) {
    return cachedToken.token;
  }

  if (inFlightTokenRequest === null) {
    inFlightTokenRequest = requestToken(config)
      .then((token) => {
        cachedToken = token;
        return token;
      })
      .finally(() => {
        inFlightTokenRequest = null;
      });
  }

  const token = await inFlightTokenRequest;
  return token.token;
}

async function authorizedPost(
  config: BkashConfig,
  path: string,
  body: Record<string, unknown>,
  allowTokenRetry = true,
): Promise<ApiResponse> {
  const token = await getBkashAccessToken();

  try {
    return await fetchBkash(`${config.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: token,
        "X-APP-Key": config.appKey,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (
      allowTokenRetry &&
      error instanceof BkashApiError &&
      error.httpStatus === 401
    ) {
      clearBkashTokenCache();
      return authorizedPost(config, path, body, false);
    }

    throw error;
  }
}

/** Creates a hosted sandbox checkout session. */
export async function createBkashPayment(input: {
  amount: bigint;
  merchantInvoiceNumber: string;
  payerReference: string;
}): Promise<BkashCreatePaymentResult> {
  if (input.amount <= 0n) {
    throw new BkashApiError("bKash amount must be positive", {
      uncertain: false,
    });
  }

  const config = getBkashConfig();
  const data = await authorizedPost(config, CREATE_PATH, {
    mode: "0011",
    payerReference: input.payerReference,
    callbackURL: getBkashCallbackUrl(),
    amount: poishaToDecimalString(input.amount),
    currency: "BDT",
    intent: "sale",
    merchantInvoiceNumber: input.merchantInvoiceNumber,
  });

  assertBkashSuccess(data);

  if (!data.paymentID || !data.bkashURL) {
    throw new BkashApiError(
      "bKash did not return a payment id and checkout URL",
      { uncertain: false },
    );
  }

  if (!hasSandboxHost(data.bkashURL)) {
    throw new BkashApiError("bKash returned an untrusted checkout URL", {
      uncertain: false,
    });
  }

  return {
    paymentID: data.paymentID,
    bkashURL: data.bkashURL,
  };
}

/** Executes a payment after a successful bKash callback. */
export async function executeBkashPayment(
  paymentID: string,
): Promise<BkashTransactionResult> {
  const config = getBkashConfig();
  const data = await authorizedPost(config, EXECUTE_PATH, { paymentID });

  assertBkashSuccess(data);
  return toTransactionResult(data);
}

/** Reads the current server-side status of a payment. */
export async function queryBkashPayment(
  paymentID: string,
): Promise<BkashTransactionResult> {
  const config = getBkashConfig();
  const data = await authorizedPost(config, QUERY_PATH, { paymentID });

  assertBkashSuccess(data);
  return toTransactionResult(data);
}
