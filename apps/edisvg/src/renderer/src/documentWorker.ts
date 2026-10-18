import { executeDocumentTransaction } from "../../shared/documentCommands";
import { documentTaskSchema } from "../../shared/documentTask";

/** No DOM, IPC, file access, network or document-provided code. */
globalThis.onmessage = (event: MessageEvent<unknown>) => {
  try {
    const { context, request } = documentTaskSchema.parse(event.data);
    globalThis.postMessage({ ok: true, result: executeDocumentTransaction(context, request) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Operação recusada.";
    globalThis.postMessage({
      ok: false,
      message: message.slice(0, 2000),
      truncated: message.length > 2000,
    });
  }
};
