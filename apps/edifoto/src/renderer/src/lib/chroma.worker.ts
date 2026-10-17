import { type ChromaKey, keyFrame } from "@shared/chroma";

self.onmessage = (
  event: MessageEvent<{ pixels: Uint8ClampedArray; width: number; height: number; key: ChromaKey }>,
): void => {
  try {
    const { pixels, width, height, key } = event.data;
    const result = keyFrame(pixels, 4, width, height, key);
    self.postMessage({ pixels: result }, { transfer: [result.buffer] });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
