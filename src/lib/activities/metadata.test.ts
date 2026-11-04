import { describe, expect, it } from "vitest";

import { sanitizeActivityMetadata } from "@/lib/activities/metadata";

describe("sanitizeActivityMetadata", () => {
  it("converts JSON-unsafe values and drops credential-like keys", () => {
    const metadata = sanitizeActivityMetadata({
      name: "Safe",
      amount: 12_000n,
      createdAt: new Date(Date.UTC(2026, 10, 4)),
      notANumber: Number.NaN,
      nested: {
        safe: "visible",
        password: "hidden",
        accessToken: "hidden",
        children: [{ safe: true, otp: "123456" }],
      },
      appKey: "hidden",
      appSecret: "hidden",
    });

    expect(metadata).toEqual({
      name: "Safe",
      amount: "12000",
      createdAt: "2026-11-04T00:00:00.000Z",
      notANumber: null,
      nested: {
        safe: "visible",
        children: [{ safe: true }],
      },
    });
  });

  it("rejects non-object metadata roots", () => {
    expect(sanitizeActivityMetadata(null)).toBeNull();
    expect(sanitizeActivityMetadata(["a"])).toBeNull();
    expect(sanitizeActivityMetadata("text")).toBeNull();
  });
});
