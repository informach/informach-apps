import type { LottieOptions } from "../../shared/lottie/prepare";
import { readLottieTaskMessage } from "../../shared/lottie/protocol";
import type { Project } from "../../shared/project";
import { runBoundedWorkerTask } from "./boundedWorkerTask";

export function runLottieTask(
  project: Project,
  options: LottieOptions,
  operation: "inspect" | "compile",
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void,
) {
  return runBoundedWorkerTask(
    () => new Worker(new URL("./lottieWorker.ts", import.meta.url), { type: "module" }),
    { version: 1, operation, project, options },
    (message) => readLottieTaskMessage(message, onProgress),
    signal,
  );
}
