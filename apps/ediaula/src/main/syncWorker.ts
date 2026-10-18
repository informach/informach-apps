import { parentPort } from "node:worker_threads";
import { rankPieces } from "../shared/audioSync.ts";

/** Ranks exported voice pieces for a HeyGen clip off the main thread (main/syncPool.ts). */
parentPort?.on("message", (m: { pieces: Float32Array[]; clip: Float32Array }) => {
  parentPort?.postMessage(rankPieces(m.pieces, m.clip));
});
