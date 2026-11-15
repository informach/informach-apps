import assert from "node:assert/strict";

/** Tests should report an absent fixture before inspecting its fields. */
export function assertDefined<T>(value: T | null | undefined): T {
  assert.ok(value !== null && value !== undefined, "Valor esperado ausente no teste.");
  return value;
}
