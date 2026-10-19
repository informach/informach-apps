import { type BatchWorkerInput, batchWorkerReplySchema } from "@shared/batch-worker-format";
import { type TaskResult, taskResultSchema } from "@shared/task-format";
import type { LocalTask } from "./tasks";

/** Every worker acknowledgement waits for the authenticated protected checkpoint in main. */
export function runBatch(
  task: LocalTask,
  request: BatchWorkerInput,
  progress: (message: string) => void,
): Promise<TaskResult> {
  return new Promise((resolve, reject) => {
    if (task.signal.aborted) {
      reject(new DOMException("Lote cancelado", "AbortError"));
      return;
    }
    const worker = new Worker(new URL("./batch-worker.ts", import.meta.url), { type: "module" });
    let first = !request.previous,
      ended = false,
      previousSequence = 0;
    const finish = () => {
      ended = true;
      task.signal.removeEventListener("abort", abort);
      worker.terminate();
    };
    const fail = (failure: unknown) => {
      if (ended) return;
      finish();
      reject(failure);
    };
    const abort = () =>
      fail(
        new DOMException(
          "Lote interrompido; arquivos completos permanecem em Tarefas.",
          "AbortError",
        ),
      );
    task.signal.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => fail(new Error(event.message || "Falha no worker de lotes."));
    worker.onmessage = (event: MessageEvent<unknown>) => {
      void (async () => {
        const reply = batchWorkerReplySchema.parse(event.data);
        if (reply.kind === "error") throw new Error(reply.error);
        if (reply.kind === "planning") {
          const message =
            reply.stage === "bookmarks"
              ? "Planejando divisão por marcadores…"
              : "Conferindo o tamanho real das partes…";
          task.describe(message);
          progress(message);
          return;
        }
        if (reply.kind === "progress") {
          const message = `${reply.done} de ${reply.total} arquivos completos`;
          task.describe(message);
          progress(message);
          return;
        }
        const result = taskResultSchema.parse({
          ...reply.payload,
          pdf: request.pdf,
          pages: reply.payload.detail.sourcePages,
          extension: "zip",
        });
        if (reply.kind === "complete") {
          await task.ready(result);
          finish();
          resolve(result);
          return;
        }
        if (reply.seq !== previousSequence + 1)
          throw new Error("Checkpoint do lote repetido ou fora de ordem.");
        previousSequence = reply.seq;
        if (first) {
          await task.checkpointResult(result);
          first = false;
        } else await task.checkpointBatch(result.bytes, reply.payload.detail);
        task.signal.throwIfAborted();
        worker.postMessage({ kind: "ack", seq: reply.seq });
      })().catch(fail);
    };
    try {
      worker.postMessage(request);
    } catch (failure) {
      fail(failure);
    }
  });
}
