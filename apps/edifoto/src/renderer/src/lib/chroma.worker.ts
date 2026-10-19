import { type ChromaKey, keyFrame } from "@shared/chroma";

import { uniformCutout } from "@shared/masks";

self.onmessage = (
  event: MessageEvent<{
    pixels: Uint8ClampedArray;
    width: number;
    height: number;
    key: ChromaKey;
    method?: "chroma" | "uniform";
    tolerance?: number;
    feather?: number;
  }>,
): void => {
  try {
    const { pixels, width, height, key, method, tolerance, feather } = event.data;
    const result =
      method === "uniform"
        ? uniformCutout(pixels, width, height, key.color, tolerance ?? 30, feather ?? 0)
        : keyFrame(pixels, 4, width, height, key);
    self.postMessage({ pixels: result }, { transfer: [result.buffer] });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
