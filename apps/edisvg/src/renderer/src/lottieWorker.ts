import { compileLottie } from "../../shared/lottie/compile";
import { inspectLottieCompatibility } from "../../shared/lottie/prepare";
import { lottieRequestSchema } from "../../shared/lottie/protocol";

/** A closed computational worker, without DOM, IPC, network or authored code. */
globalThis.onmessage = (event: MessageEvent<unknown>) => {
  try {
    const request = lottieRequestSchema.parse(event.data);
    if (request.operation === "inspect") {
      globalThis.postMessage({
        kind: "report",
        report: inspectLottieCompatibility(request.project, request.options),
      });
      return;
    }
    const exported = compileLottie(request.project, request.options, (completed, total) =>
      globalThis.postMessage({ kind: "progress", completed, total }),
    );
    globalThis.postMessage({ kind: "export", content: exported.content, report: exported.report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Exportação Lottie recusada.";
    globalThis.postMessage({
      kind: "error",
      message: message.slice(0, 2000),
      truncated: message.length > 2000,
    });
  }
};
