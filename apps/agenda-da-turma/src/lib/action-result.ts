"use client";

type ActionResult<T, E> = { ok: true; value: T } | { ok: false; error: E };

export type ActionRejectedError = { code: "ACTION_REJECTED" };

export async function catchActionResult<TResult extends ActionResult<unknown, { code: string }>>(
  run: () => Promise<TResult>,
): Promise<TResult | { ok: false; error: ActionRejectedError }> {
  try {
    return await run();
  } catch {
    return { ok: false, error: { code: "ACTION_REJECTED" } };
  }
}

export function isActionRejected(error: { code: string }): error is ActionRejectedError {
  return error.code === "ACTION_REJECTED";
}
