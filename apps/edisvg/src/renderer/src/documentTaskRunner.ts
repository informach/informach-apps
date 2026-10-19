import { readDocumentTaskResult } from "../../shared/documentTask";
import type { Project } from "../../shared/project";
import { runBoundedWorkerTask } from "./boundedWorkerTask";

/** One bounded task at a time. Termination is real cancellation, not a late
 * ignored result; a 10s wall-clock resource deadline includes initialization. */
export async function runDocumentTask(
  context: { project: Project; sessionId: string; revision: number },
  request: unknown,
  signal?: AbortSignal,
) {
  return runBoundedWorkerTask(
    () => new Worker(new URL("./documentWorker.ts", import.meta.url), { type: "module" }),
    { version: 1, context, request },
    (message) => ({ done: true, value: readDocumentTaskResult(message) }),
    signal,
  );
}
