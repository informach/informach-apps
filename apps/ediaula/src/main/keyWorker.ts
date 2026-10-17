import { parentPort } from "node:worker_threads";
import { type ChromaKey, keyFrame } from "../shared/chroma.ts";

/** Keys RGB frames off the main thread; several of these run in parallel. */
parentPort!.on(
  "message",
  (m: { seq: number; data: Uint8Array; width: number; height: number; key: ChromaKey }) => {
    const out = keyFrame(m.data, 3, m.width, m.height, m.key);
    parentPort!.postMessage({ seq: m.seq, data: out }, [out.buffer as ArrayBuffer]);
  },
);
