import moduleLoader from "@mediapipe/tasks-vision/vision_wasm_module_internal.js?url";
import moduleWasm from "@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url";
import type { Asset } from "@shared/types";
import type { PersonKeyReply, PersonKeyRequest } from "./personKeyWorker";

/**
 * "Remover fundo com IA local" for one media (shared/personKey.ts): the main process hands out
 * the small frames, the worker (lib/personKeyWorker.ts) turns them into masks, and they go back
 * in order to be written as the alpha of the camera. Started by lib/keying.ts like the color key.
 */

const absolute = (url: string): string => new URL(url, location.href).href;

/** One worker for the app, loaded with the model the first time it is needed. */
let worker: { port: Worker; ready: Promise<void> } | null = null;
let serial = 0;
const pending = new Map<number, { resolve: (m: Uint8Array) => void; reject: (e: Error) => void }>();

function getWorker(): Promise<Worker> {
  if (!worker) {
    const port = new Worker(new URL("./personKeyWorker.ts", import.meta.url), { type: "module" });
    let markReady = (): void => undefined;
    let markFailed = (_error: Error): void => undefined;
    const ready = new Promise<void>((resolve, reject) => {
      markReady = resolve;
      markFailed = reject;
    });
    port.onmessage = (event: MessageEvent<PersonKeyReply>) => {
      const reply = event.data;
      if (reply.kind === "ready") return markReady();
      if (reply.kind === "masks") {
        pending.get(reply.id)?.resolve(reply.masks);
        pending.delete(reply.id);
        return;
      }
      const error = new Error(reply.message);
      if (reply.id === undefined) return markFailed(error);
      pending.get(reply.id)?.reject(error);
      pending.delete(reply.id);
      // The runtime may be broken after a failure inside it: the next render starts a new one.
      drop();
    };
    const drop = (): void => {
      if (worker !== current) return;
      port.terminate();
      worker = null;
      const gone = new Error("A IA local foi reiniciada.");
      for (const p of pending.values()) p.reject(gone);
      pending.clear();
    };
    port.onerror = (event) => {
      const error = new Error(event.message || "A IA local parou.");
      markFailed(error);
      for (const p of pending.values()) p.reject(error);
      pending.clear();
      drop();
    };
    const current = { port, ready };
    worker = current;
    void window.api.personKey.model().then(
      (model) => {
        const init: PersonKeyRequest = {
          kind: "init",
          model,
          files: { loader: absolute(moduleLoader), wasm: absolute(moduleWasm) },
        };
        port.postMessage(init);
      },
      (error: unknown) => markFailed(error instanceof Error ? error : new Error(String(error))),
    );
    // A worker that could not load is made again next time.
    ready.catch(drop);
  }
  const { port, ready } = worker;
  return ready.then(() => port);
}

async function segment(
  data: Uint8Array,
  count: number,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const port = await getWorker();
  const id = ++serial;
  return new Promise<Uint8Array>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const request: PersonKeyRequest = { kind: "segment", id, data, count, width, height };
    // The frames are not needed here once handed over: their memory moves to the worker.
    const buffer = data.buffer;
    port.postMessage(request, buffer instanceof ArrayBuffer ? [buffer] : []);
  });
}

/**
 * Renders `asset` with its background removed by the local AI and answers the cached video.
 * `onProgress` gets 0..1 as the frames go.
 */
export async function renderPersonKey(
  jobId: string,
  asset: Pick<Asset, "path" | "width" | "height" | "fps" | "duration">,
  onProgress: (ratio: number) => void,
): Promise<string> {
  const started = await window.api.personKey.begin(jobId, {
    path: asset.path,
    width: Math.round(asset.width),
    height: Math.round(asset.height),
    fps: asset.fps,
    duration: asset.duration,
  });
  if ("cached" in started) return started.cached;
  try {
    let done = 0;
    for (;;) {
      const batch = await window.api.personKey.frames(jobId);
      if (!batch.count) break;
      const masks = await segment(batch.data, batch.count, started.width, started.height);
      await window.api.personKey.masks(jobId, masks);
      done += batch.count;
      onProgress(Math.min(0.99, done / started.total));
    }
    const path = await window.api.personKey.end(jobId);
    onProgress(1);
    return path;
  } catch (error) {
    await window.api.personKey.cancel(jobId).catch(() => undefined);
    throw error;
  }
}
