import type { PieceMatch } from "../shared/audioSync.ts";
import createSyncWorker from "./syncWorker?nodeWorker";

/**
 * The correlation of a presenter video against the exported voice runs in a worker thread: a long
 * lesson takes seconds of FFT, and the main process keeps answering the windows meanwhile. The
 * signals live in shared memory (main/presenterVideo.ts decodeMono), so nothing is copied.
 */
export function rankInWorker(pieces: Float32Array[], clip: Float32Array): Promise<PieceMatch[]> {
  const worker = createSyncWorker({});
  return new Promise<PieceMatch[]>((resolve, reject) => {
    worker.once("message", (ranked: PieceMatch[]) => resolve(ranked));
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`a comparação do som parou (código ${code})`));
    });
    worker.postMessage({ pieces, clip });
  }).finally(() => void worker.terminate());
}
