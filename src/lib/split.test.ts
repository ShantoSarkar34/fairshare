import { describe, expect, it } from "vitest";

import {
  splitEqual,
  splitExact,
  splitPercentage,
  splitShares,
  type SplitAllocation,
} from "./split";

function expectValidSplit(result: SplitAllocation[], total: bigint): void {
  const allocated = result.reduce((sum, entry) => sum + entry.amount, 0n);

  expect(allocated).toBe(total);

  for (const entry of result) {
    expect(entry.amount >= 0n).toBe(true);
  }

  const userIds = result.map((entry) => entry.userId);
  expect(new Set(userIds).size).toBe(userIds.length);
  expect(userIds).toEqual([...userIds].sort());
}

describe("splitEqual", () => {
  it("splits ৳100 three ways and gives the remainder to the first userId", () => {
    const result = splitEqual(10000n, ["charlie", "alice", "bob"]);

    expect(result).toEqual([
      { userId: "alice", amount: 3334n },
      { userId: "bob", amount: 3333n },
      { userId: "charlie", amount: 3333n },
    ]);
    expectValidSplit(result, 10000n);
  });

  it("splits evenly when the total is divisible", () => {
    const result = splitEqual(12000n, ["b", "a"]);

    expect(result).toEqual([
      { userId: "a", amount: 6000n },
      { userId: "b", amount: 6000n },
    ]);
    expectValidSplit(result, 12000n);
  });

  it("supports a single participant", () => {
    const result = splitEqual(10000n, ["solo"]);

    expect(result).toEqual([{ userId: "solo", amount: 10000n }]);
    expectValidSplit(result, 10000n);
  });

  it("handles one poisha among three participants", () => {
    const result = splitEqual(1n, ["a", "b", "c"]);

    expect(result).toEqual([
      { userId: "a", amount: 1n },
      { userId: "b", amount: 0n },
      { userId: "c", amount: 0n },
    ]);
    expectValidSplit(result, 1n);
  });

  it("distributes a two-poisha remainder deterministically", () => {
    const result = splitEqual(10001n, ["c", "b", "a"]);

    expect(result).toEqual([
      { userId: "a", amount: 3334n },
      { userId: "b", amount: 3334n },
      { userId: "c", amount: 3333n },
    ]);
    expectValidSplit(result, 10001n);
  });

  it("is independent of input order", () => {
    const first = splitEqual(10000n, ["c", "a", "b"]);
    const second = splitEqual(10000n, ["b", "c", "a"]);

    expect(first).toEqual(second);
  });

  it("preserves the total for several totals and participant counts", () => {
    const totals = [1n, 2n, 99n, 100n, 10000n, 10001n, 999999999n];
    const groups = [
      ["a"],
      ["a", "b"],
      ["a", "b", "c"],
      ["a", "b", "c", "d", "e"],
    ];

    for (const total of totals) {
      for (const userIds of groups) {
        expectValidSplit(splitEqual(total, userIds), total);
      }
    }
  });

  it("rejects zero and negative totals", () => {
    expect(() => splitEqual(0n, ["a"])).toThrow(RangeError);
    expect(() => splitEqual(-1n, ["a"])).toThrow(RangeError);
  });

  it("rejects an empty participant list", () => {
    expect(() => splitEqual(10000n, [])).toThrow(RangeError);
  });

  it("rejects duplicate participants", () => {
    expect(() => splitEqual(10000n, ["a", "a"])).toThrow(RangeError);
  });

  it("rejects an empty userId", () => {
    expect(() => splitEqual(10000n, [""])).toThrow(RangeError);
    expect(() => splitEqual(10000n, ["   "])).toThrow(RangeError);
  });

  it("rejects a non-bigint total at runtime", () => {
    expect(() => splitEqual(100 as unknown as bigint, ["a"])).toThrow(
      TypeError,
    );
  });
});

describe("splitExact", () => {
  it("accepts allocations that sum exactly to the total", () => {
    const result = splitExact(100000n, [
      { userId: "b", amount: 30000n },
      { userId: "c", amount: 20000n },
      { userId: "a", amount: 50000n },
    ]);

    expect(result).toEqual([
      { userId: "a", amount: 50000n },
      { userId: "b", amount: 30000n },
      { userId: "c", amount: 20000n },
    ]);
    expectValidSplit(result, 100000n);
  });

  it("supports a single participant", () => {
    const result = splitExact(12345n, [{ userId: "a", amount: 12345n }]);

    expect(result).toEqual([{ userId: "a", amount: 12345n }]);
    expectValidSplit(result, 12345n);
  });

  it("rejects allocations whose sum is too low", () => {
    expect(() =>
      splitExact(100000n, [
        { userId: "a", amount: 50000n },
        { userId: "b", amount: 49999n },
      ]),
    ).toThrow(RangeError);
  });

  it("rejects allocations whose sum is too high", () => {
    expect(() =>
      splitExact(100000n, [
        { userId: "a", amount: 50000n },
        { userId: "b", amount: 50001n },
      ]),
    ).toThrow(RangeError);
  });

  it("rejects zero and negative allocations", () => {
    expect(() =>
      splitExact(10000n, [{ userId: "a", amount: 0n }]),
    ).toThrow(RangeError);
    expect(() =>
      splitExact(10000n, [{ userId: "a", amount: -1n }]),
    ).toThrow(RangeError);
  });

  it("rejects zero and negative totals", () => {
    expect(() =>
      splitExact(0n, [{ userId: "a", amount: 1n }]),
    ).toThrow(RangeError);
    expect(() =>
      splitExact(-1n, [{ userId: "a", amount: -1n }]),
    ).toThrow(RangeError);
  });

  it("rejects an empty participant list", () => {
    expect(() => splitExact(10000n, [])).toThrow(RangeError);
  });

  it("rejects duplicate participants", () => {
    expect(() =>
      splitExact(10000n, [
        { userId: "a", amount: 5000n },
        { userId: "a", amount: 5000n },
      ]),
    ).toThrow(RangeError);
  });

  it("rejects a non-bigint allocation at runtime", () => {
    expect(() =>
      splitExact(10000n, [
        { userId: "a", amount: 10000 as unknown as bigint },
      ]),
    ).toThrow(TypeError);
  });
});

describe("splitPercentage", () => {
  it("splits 50% / 30% / 20% exactly", () => {
    const result = splitPercentage(100000n, [
      { userId: "c", basisPoints: 2000 },
      { userId: "a", basisPoints: 5000 },
      { userId: "b", basisPoints: 3000 },
    ]);

    expect(result).toEqual([
      { userId: "a", amount: 50000n },
      { userId: "b", amount: 30000n },
      { userId: "c", amount: 20000n },
    ]);
    expectValidSplit(result, 100000n);
  });

  it("distributes the remainder by largest fractional remainder", () => {
    const result = splitPercentage(100n, [
      { userId: "a", basisPoints: 3333 },
      { userId: "b", basisPoints: 3333 },
      { userId: "c", basisPoints: 3334 },
    ]);

    expect(result).toEqual([
      { userId: "a", amount: 33n },
      { userId: "b", amount: 33n },
      { userId: "c", amount: 34n },
    ]);
    expectValidSplit(result, 100n);
  });

  it("breaks equal remainders by userId", () => {
    const result = splitPercentage(10001n, [
      { userId: "b", basisPoints: 5000 },
      { userId: "a", basisPoints: 5000 },
    ]);

    expect(result).toEqual([
      { userId: "a", amount: 5001n },
      { userId: "b", amount: 5000n },
    ]);
    expectValidSplit(result, 10001n);
  });

  it("allows a 0% participant who receives nothing", () => {
    const result = splitPercentage(10000n, [
      { userId: "a", basisPoints: 10000 },
      { userId: "b", basisPoints: 0 },
    ]);

    expect(result).toEqual([
      { userId: "a", amount: 10000n },
      { userId: "b", amount: 0n },
    ]);
    expectValidSplit(result, 10000n);
  });

  it("preserves the total for several totals", () => {
    for (const total of [1n, 2n, 99n, 100n, 10000n, 10001n, 999999999n]) {
      const result = splitPercentage(total, [
        { userId: "a", basisPoints: 3333 },
        { userId: "b", basisPoints: 3333 },
        { userId: "c", basisPoints: 3334 },
      ]);
      expectValidSplit(result, total);
    }
  });

  it("is independent of input order", () => {
    const first = splitPercentage(10000n, [
      { userId: "b", basisPoints: 5000 },
      { userId: "a", basisPoints: 5000 },
    ]);
    const second = splitPercentage(10000n, [
      { userId: "a", basisPoints: 5000 },
      { userId: "b", basisPoints: 5000 },
    ]);

    expect(first).toEqual(second);
  });

  it("rejects percentages that do not sum to 100%", () => {
    expect(() =>
      splitPercentage(10000n, [
        { userId: "a", basisPoints: 5000 },
        { userId: "b", basisPoints: 4999 },
      ]),
    ).toThrow(RangeError);

    expect(() =>
      splitPercentage(10000n, [
        { userId: "a", basisPoints: 5000 },
        { userId: "b", basisPoints: 5001 },
      ]),
    ).toThrow(RangeError);
  });

  it("rejects negative, fractional or unsafe basis points", () => {
    expect(() =>
      splitPercentage(10000n, [{ userId: "a", basisPoints: -1 }]),
    ).toThrow(RangeError);

    expect(() =>
      splitPercentage(10000n, [{ userId: "a", basisPoints: 50.5 }]),
    ).toThrow(RangeError);

    expect(() =>
      splitPercentage(10000n, [
        { userId: "a", basisPoints: Number.MAX_SAFE_INTEGER + 1 },
      ]),
    ).toThrow(RangeError);
  });

  it("rejects zero and negative totals", () => {
    expect(() =>
      splitPercentage(0n, [{ userId: "a", basisPoints: 10000 }]),
    ).toThrow(RangeError);
    expect(() =>
      splitPercentage(-1n, [{ userId: "a", basisPoints: 10000 }]),
    ).toThrow(RangeError);
  });

  it("rejects an empty participant list", () => {
    expect(() => splitPercentage(10000n, [])).toThrow(RangeError);
  });

  it("rejects duplicate participants", () => {
    expect(() =>
      splitPercentage(10000n, [
        { userId: "a", basisPoints: 5000 },
        { userId: "a", basisPoints: 5000 },
      ]),
    ).toThrow(RangeError);
  });
});

describe("splitShares", () => {
  it("splits ৳1,000 in a 2:1:1 ratio", () => {
    const result = splitShares(100000n, [
      { userId: "b", shares: 1 },
      { userId: "a", shares: 2 },
      { userId: "c", shares: 1 },
    ]);

    expect(result).toEqual([
      { userId: "a", amount: 50000n },
      { userId: "b", amount: 25000n },
      { userId: "c", amount: 25000n },
    ]);
    expectValidSplit(result, 100000n);
  });

  it("splits equal shares with a deterministic remainder", () => {
    const result = splitShares(10000n, [
      { userId: "c", shares: 1 },
      { userId: "a", shares: 1 },
      { userId: "b", shares: 1 },
    ]);

    expect(result).toEqual([
      { userId: "a", amount: 3334n },
      { userId: "b", amount: 3333n },
      { userId: "c", amount: 3333n },
    ]);
    expectValidSplit(result, 10000n);
  });

  it("hands the leftover poisha to the largest fractional share", () => {
    const result = splitShares(100n, [
      { userId: "a", shares: 1 },
      { userId: "b", shares: 1 },
      { userId: "c", shares: 1 },
    ]);

    expect(result).toEqual([
      { userId: "a", amount: 34n },
      { userId: "b", amount: 33n },
      { userId: "c", amount: 33n },
    ]);
    expectValidSplit(result, 100n);
  });

  it("handles a total smaller than the number of shares", () => {
    const result = splitShares(1n, [
      { userId: "a", shares: 2 },
      { userId: "b", shares: 1 },
      { userId: "c", shares: 1 },
    ]);

    expect(result).toEqual([
      { userId: "a", amount: 1n },
      { userId: "b", amount: 0n },
      { userId: "c", amount: 0n },
    ]);
    expectValidSplit(result, 1n);
  });

  it("preserves the total for several totals", () => {
    for (const total of [1n, 2n, 99n, 100n, 10000n, 10001n, 999999999n]) {
      const result = splitShares(total, [
        { userId: "a", shares: 2 },
        { userId: "b", shares: 1 },
        { userId: "c", shares: 1 },
      ]);
      expectValidSplit(result, total);
    }
  });

  it("is independent of input order", () => {
    const first = splitShares(100000n, [
      { userId: "b", shares: 1 },
      { userId: "a", shares: 2 },
      { userId: "c", shares: 1 },
    ]);
    const second = splitShares(100000n, [
      { userId: "a", shares: 2 },
      { userId: "c", shares: 1 },
      { userId: "b", shares: 1 },
    ]);

    expect(first).toEqual(second);
  });

  it("rejects zero, negative, fractional or unsafe shares", () => {
    expect(() =>
      splitShares(10000n, [{ userId: "a", shares: 0 }]),
    ).toThrow(RangeError);

    expect(() =>
      splitShares(10000n, [{ userId: "a", shares: -1 }]),
    ).toThrow(RangeError);

    expect(() =>
      splitShares(10000n, [{ userId: "a", shares: 1.5 }]),
    ).toThrow(RangeError);

    expect(() =>
      splitShares(10000n, [
        { userId: "a", shares: Number.MAX_SAFE_INTEGER + 1 },
      ]),
    ).toThrow(RangeError);
  });

  it("rejects zero and negative totals", () => {
    expect(() =>
      splitShares(0n, [{ userId: "a", shares: 1 }]),
    ).toThrow(RangeError);
    expect(() =>
      splitShares(-1n, [{ userId: "a", shares: 1 }]),
    ).toThrow(RangeError);
  });

  it("rejects an empty participant list", () => {
    expect(() => splitShares(10000n, [])).toThrow(RangeError);
  });

  it("rejects duplicate participants", () => {
    expect(() =>
      splitShares(10000n, [
        { userId: "a", shares: 1 },
        { userId: "a", shares: 1 },
      ]),
    ).toThrow(RangeError);
  });
});
