import { parentPort } from "node:worker_threads";
import { appendScannedPage } from "../shared/scan-pdf.ts";

const port = parentPort;
if (!port) throw new Error("O conversor de digitalização exige uma thread local.");
port.once("message", (request: unknown) => {
  void appendScannedPage(request).then(
    (result) => port.postMessage({ ok: true, ...result }),
    (error: unknown) =>
      port.postMessage({
        ok: false,
        error: error instanceof Error ? error.message : "Falha ao preparar a página digitalizada.",
      }),
  );
});
