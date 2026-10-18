import { ImageSegmenter } from "@mediapipe/tasks-vision";
import { confidenceToAlpha } from "@shared/personKey";

/**
 * The local AI of "Remover fundo com IA local", off the editor's thread: the person segmentation
 * model on the CPU, one small RGBA frame after another, answering one byte of alpha per pixel
 * (shared/personKey.ts confidenceToAlpha). It is a module worker (lib/personKey.ts makes it one,
 * and Vite keeps it so in the dev server and in the build), so the runtime is the module build of
 * its loader, which a module worker imports.
 */

export interface WasmFiles {
  loader: string;
  wasm: string;
}

export type PersonKeyRequest =
  | { kind: "init"; model: Uint8Array; files: WasmFiles }
  | { kind: "segment"; id: number; data: Uint8Array; count: number; width: number; height: number };

export type PersonKeyReply =
  | { kind: "ready" }
  | { kind: "masks"; id: number; masks: Uint8Array; ms: number }
  | { kind: "error"; id?: number; message: string };

let segmenter: ImageSegmenter | null = null;

const reply = (message: PersonKeyReply, transfer: Transferable[] = []): void =>
  self.postMessage(message, { transfer });

const text = (error: unknown): string => (error instanceof Error ? error.message : String(error));

self.onmessage = async (event: MessageEvent<PersonKeyRequest>) => {
  const request = event.data;
  if (request.kind === "init") {
    try {
      segmenter ??= await ImageSegmenter.createFromOptions(
        { wasmLoaderPath: request.files.loader, wasmBinaryPath: request.files.wasm },
        {
          baseOptions: { modelAssetBuffer: request.model, delegate: "CPU" },
          runningMode: "IMAGE",
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        },
      );
      reply({ kind: "ready" });
    } catch (error) {
      reply({ kind: "error", message: text(error) });
    }
    return;
  }
  const { id, data, count, width, height } = request;
  try {
    if (!segmenter) throw new Error("A IA local não foi carregada.");
    const pixels = width * height;
    const masks = new Uint8Array(count * pixels);
    const started = performance.now();
    for (let i = 0; i < count; i++) {
      const rgba = new Uint8ClampedArray(pixels * 4);
      rgba.set(data.subarray(i * pixels * 4, (i + 1) * pixels * 4));
      const result = segmenter.segment(new ImageData(rgba, width, height));
      try {
        const mask = result.confidenceMasks?.[0];
        if (!mask || mask.width !== width || mask.height !== height)
          throw new Error("A IA local não devolveu a máscara do quadro.");
        confidenceToAlpha(mask.getAsFloat32Array(), masks, i * pixels);
      } finally {
        result.close();
      }
    }
    const ms = count ? (performance.now() - started) / count : 0;
    reply({ kind: "masks", id, masks, ms }, [masks.buffer]);
  } catch (error) {
    reply({ kind: "error", id, message: text(error) });
  }
};
