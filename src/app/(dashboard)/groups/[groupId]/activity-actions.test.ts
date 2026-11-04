import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getGroupActivityPage: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/services/activity.service", () => ({
  getGroupActivityPage: mocks.getGroupActivityPage,
  recordActivity: vi.fn(),
}));

import * as activityActions from "./activity-actions";
import { loadActivityPageAction } from "./activity-actions";
import { NotFoundError } from "@/lib/errors";

const USER = { id: "user_session", name: "Rafi", email: "rafi@example.com" };
const GROUP_ID = "group_1";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(USER);
  mocks.getGroupActivityPage.mockResolvedValue({
    items: [],
    nextCursor: null,
    hasMore: false,
  });
});

describe("activity actions", () => {
  it("exposes no public action for creating, editing, or deleting activity", () => {
    expect(activityActions).not.toHaveProperty("createActivityAction");
    expect(activityActions).not.toHaveProperty("updateActivityAction");
    expect(activityActions).not.toHaveProperty("deleteActivityAction");
  });
});

describe("loadActivityPageAction", () => {
  it("uses the session user and never accepts a client actor id", async () => {
    // The extra argument models a forged client field. It is ignored because
    // the action only reads groupId, cursor, limit and the session identity.
    const forgedActorAction = loadActivityPageAction as unknown as (
      ...args: unknown[]
    ) => ReturnType<typeof loadActivityPageAction>;

    const result = await forgedActorAction(
      GROUP_ID,
      null,
      20,
      "forged_actor",
    );

    expect(result).toEqual({
      ok: true,
      data: { items: [], nextCursor: null, hasMore: false },
    });
    expect(mocks.getGroupActivityPage).toHaveBeenCalledWith(
      GROUP_ID,
      USER.id,
      { cursor: undefined, limit: 20 },
    );
  });

  it("rejects invalid pagination before calling the service", async () => {
    const result = await loadActivityPageAction(GROUP_ID, "bad-cursor", 500);

    expect(result.ok).toBe(false);
    expect(mocks.getGroupActivityPage).not.toHaveBeenCalled();
  });

  it("returns a safe failure for an inaccessible group", async () => {
    mocks.getGroupActivityPage.mockRejectedValue(
      new NotFoundError("Group not found"),
    );

    const result = await loadActivityPageAction(GROUP_ID, null, 20);

    expect(result).toEqual({ ok: false, error: "Group not found" });
  });

  it("does not catch an authentication redirect", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(
      loadActivityPageAction(GROUP_ID, null, 20),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.getGroupActivityPage).not.toHaveBeenCalled();
  });
});
