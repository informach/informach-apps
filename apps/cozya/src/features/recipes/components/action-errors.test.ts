import { describe, expect, it } from "vitest";
import { catchActionResult, isActionRejected } from "./action-errors";

describe("catchActionResult", () => {
  it("preserves action results", async () => {
    const result = await catchActionResult(async () => ({ ok: true as const, value: { id: "1" } }));

    expect(result).toEqual({ ok: true, value: { id: "1" } });
  });

  it("turns action rejections into a typed error", async () => {
    const failingAction = async (): Promise<{ ok: true; value: { id: string } }> =>
      Promise.reject(new Error("rate limited"));

    const result = await catchActionResult(failingAction);

    expect(result).toEqual({ ok: false, error: { code: "ACTION_REJECTED" } });
    if (!result.ok) {
      expect(isActionRejected(result.error)).toBe(true);
    }
  });
});
