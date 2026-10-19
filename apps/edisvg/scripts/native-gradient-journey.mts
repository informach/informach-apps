import assert from "node:assert/strict";
import type { Page } from "playwright";
import { nativeGraphicPixels } from "./native-graphics-pixels.mts";
export async function verifyNativeGradient(
  page: Page,
  compiled: { svg: string; document: unknown },
) {
  const result = await nativeGraphicPixels(page, compiled, [
    [5, 50],
    [50, 50],
    [94, 50],
  ]);
  const [left, center, right] = result.pixels;
  assert.ok(Math.abs((left?.[0] ?? 0) - 241) <= 1 && Math.abs((left?.[2] ?? 0) - 14) <= 1);
  assert.ok(Math.abs((center?.[0] ?? 0) - 126) <= 1 && Math.abs((center?.[2] ?? 0) - 129) <= 1);
  assert.ok(Math.abs((right?.[2] ?? 0) - 241) <= 1);
  assert.equal(result.preserved, true);
  console.log("Verified native typed gradient pixels under file/CSP without changing the project");
}
