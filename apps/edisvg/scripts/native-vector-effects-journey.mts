import assert from "node:assert/strict";
import type { Page } from "playwright";
import { nativeGraphicPixels } from "./native-graphics-pixels.mts";
export async function verifyNativeVectorEffects(
  page: Page,
  compiled: { svg: string; document: unknown },
) {
  const result = await nativeGraphicPixels(
    page,
    compiled,
    [
      [20, 50],
      [40, 50],
      [60, 50],
      [90, 50],
    ],
    0.5,
  );
  assert.deepEqual(
    result.pixels.map((pixel) => pixel[3]),
    [0, 64, 64, 0],
  );
  assert.equal(result.preserved, true);
  console.log(
    "Verified native live clipping and alpha mask pixels under file/CSP without project mutation",
  );
}
