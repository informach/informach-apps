import { randomUUID } from "node:crypto";
import { BrowserWindow, protocol, type Session, session } from "electron";
import type { TaskResult } from "../shared/task-format.ts";

const PRINT_SCHEME = "edipdf-print";
protocol.registerSchemesAsPrivileged([
  {
    scheme: PRINT_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

/** The private, memory-only viewer can request one in-memory PDF and no filesystem or remote URL. */
async function withPrintWindow<T>(
  bytes: Uint8Array,
  signal: AbortSignal,
  checkpoint: () => Promise<void>,
  run: (window: BrowserWindow) => Promise<T>,
): Promise<{ value: T; warning?: string }> {
  signal.throwIfAborted();
  await checkpoint();
  const allowed = `${PRINT_SCHEME}://document/${randomUUID()}.pdf`;
  let window: BrowserWindow | undefined;
  let isolated: Session | undefined;
  let cleanupReady: (() => void) | undefined;
  const stop = () => {
    if (window && !window.isDestroyed()) window.destroy();
  };
  signal.addEventListener("abort", stop, { once: true });
  let outcome: { ok: true; value: T } | { ok: false; failure: unknown } = {
    ok: false,
    failure: new Error("Preparação de impressão interrompida."),
  };
  let warning: string | undefined;
  try {
    if (bytes.length < 1 || bytes.length > 64 * 1024 * 1024)
      throw new Error("A cópia de impressão excede 64 MB.");
    signal.throwIfAborted();
    await checkpoint();
    isolated = session.fromPartition(`edipdf-print-${randomUUID()}`, { cache: false });
    isolated.protocol.handle(PRINT_SCHEME, (request) =>
      request.url.split("#")[0] === allowed && request.method === "GET"
        ? new Response(new Uint8Array(bytes).buffer, {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Length": String(bytes.length),
              "Cache-Control": "no-store",
            },
          })
        : new Response(null, { status: 404 }),
    );
    isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    isolated.setPermissionCheckHandler(() => false);
    isolated.on("will-download", (event) => event.preventDefault());
    isolated.webRequest.onBeforeRequest((details, callback) => {
      const url = details.url.split(/[?#]/)[0];
      callback({
        cancel: !(
          url === allowed ||
          url.startsWith("chrome-extension://") ||
          url.startsWith("chrome://resources/") ||
          url.startsWith("data:") ||
          url.startsWith("blob:")
        ),
      });
    });
    window = new BrowserWindow({
      show: false,
      autoHideMenuBar: true,
      title: "Impressão EdiPDF",
      webPreferences: {
        session: isolated,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        devTools: false,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    window.webContents.on("will-attach-webview", (event) => event.preventDefault());
    // The outer file navigation completes before the out-of-process PDF viewer.
    // Await its documentLoaded protocol rather than a delay or test-only property.
    const contents = window.webContents;
    const ready = new Promise<void>((resolve, reject) => {
      let attached = false;
      let settled = false;
      const timeout = setTimeout(
        () => finish(new Error("O visualizador PDF não concluiu o carregamento em 30 segundos.")),
        30_000,
      );
      const stopped = () =>
        finish(new DOMException("Preparação de impressão cancelada", "AbortError"));
      const finish = (failure?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal.removeEventListener("abort", stopped);
        contents.removeListener("did-frame-finish-load", loaded);
        if (failure) reject(failure);
        else resolve();
      };
      const loaded = () => {
        if (contents.isDestroyed()) return;
        const frame = contents.mainFrame.framesInSubtree.find(
          (frame) =>
            frame.url.split(/[?#]/)[0] ===
            "chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html",
        );
        if (!frame || attached) return;
        attached = true;
        void frame
          .executeJavaScript(`new Promise((resolve, reject) => {
          const loaded = (event) => {
            if (event.source !== window || event.origin !== location.origin || !event.data || typeof event.data !== 'object') return;
            if (event.data.type === 'documentLoaded') { window.removeEventListener('message', loaded); event.data.load_state === 'success' ? resolve(true) : reject(new Error('O visualizador recusou o documento de impressão.')); }
          };
          window.addEventListener('message', loaded);
          window.postMessage({ type: 'initialize' }, location.origin);
        })`)
          .then(() => finish(), finish);
      };
      contents.on("did-frame-finish-load", loaded);
      signal.addEventListener("abort", stopped, { once: true });
      cleanupReady = stopped;
    });
    await Promise.all([window.loadURL(`${allowed}#toolbar=0`), ready]);
    signal.throwIfAborted();
    await checkpoint();
    outcome = { ok: true, value: await run(window) };
  } catch (failure) {
    outcome = { ok: false, failure };
  } finally {
    signal.removeEventListener("abort", stop);
    cleanupReady?.();
    stop();
  }
  try {
    isolated?.protocol.unhandle(PRINT_SCHEME);
  } catch (failure) {
    if (!outcome.ok)
      outcome = {
        ok: false,
        failure: new AggregateError(
          [outcome.failure, failure],
          "A impressão falhou e sua sessão temporária não pôde ser liberada.",
        ),
      };
    warning =
      "Não foi possível liberar a sessão temporária de impressão. Feche o EdiPDF depois de salvar seu trabalho.";
  }
  if (!outcome.ok) throw outcome.failure;
  return { value: outcome.value, warning };
}
export async function flattenPrint(
  result: TaskResult,
  checkpoint: () => Promise<void>,
  signal: AbortSignal,
): Promise<TaskResult> {
  if (result.detail?.kind !== "printing" || result.detail.stage !== "input")
    throw new Error("Entrada de impressão inválida.");
  const detail = result.detail;
  const prepared = await withPrintWindow(
    result.pdf,
    signal,
    checkpoint,
    async (window): Promise<TaskResult> => {
      const bytes = new Uint8Array(
        await window.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true }),
      );
      signal.throwIfAborted();
      await checkpoint();
      return { ...result, bytes, pdf: bytes, detail: { ...detail, stage: "flattened" } };
    },
  );
  if (prepared.warning) prepared.value.warnings.push(prepared.warning);
  return prepared.value;
}
export async function printPrepared(
  result: TaskResult,
  checkpoint: () => Promise<void>,
  signal: AbortSignal,
): Promise<{ submitted: boolean; warning?: string }> {
  if (result.detail?.kind !== "printing" || result.detail.stage !== "output")
    throw new Error("Cópia de impressão não revisada.");
  const settings = result.detail.settings;
  const submission = await withPrintWindow(result.pdf, signal, checkpoint, async (window) => {
    signal.throwIfAborted();
    await checkpoint();
    // A visible printing window gives the user a way to close a pending driver
    // operation. Preparation stays hidden until the user requests printing.
    window.show();
    window.focus();
    return new Promise<boolean>((resolve, reject) => {
      const stop = () =>
        reject(
          new DOMException("Impressão interrompida; confira a fila do sistema.", "AbortError"),
        );
      signal.addEventListener("abort", stop, { once: true });
      const closed = () => {
        signal.removeEventListener("abort", stop);
        reject(
          new DOMException(
            "Janela de impressão fechada. Confira a fila do sistema antes de tentar novamente.",
            "AbortError",
          ),
        );
      };
      window.once("closed", closed);
      try {
        window.webContents.print(
          {
            silent: false,
            printBackground: true,
            copies: settings.copies,
            collate: settings.collate,
            color: settings.color,
            duplexMode: settings.layout === "booklet" ? "shortEdge" : settings.duplex,
            ...(settings.printer ? { deviceName: settings.printer } : {}),
            ...(settings.paper === "original"
              ? { usePrinterDefaultPageSize: true }
              : {
                  pageSize:
                    settings.paper === "a3" ? "A3" : settings.paper === "a4" ? "A4" : "Letter",
                  landscape: settings.landscape || settings.layout === "booklet",
                }),
            margins: { marginType: "none" },
          },
          (success, reason) => {
            signal.removeEventListener("abort", stop);
            window.removeListener("closed", closed);
            if (success) resolve(true);
            else if (reason === "Print job canceled") resolve(false);
            else
              reject(
                new Error(`O sistema não aceitou a impressão: ${reason || "falha sem detalhe"}.`),
              );
          },
        );
      } catch (failure) {
        signal.removeEventListener("abort", stop);
        window.removeListener("closed", closed);
        reject(failure);
      }
    });
  });
  if (!submission.value && submission.warning) throw new Error(submission.warning);
  return { submitted: submission.value, warning: submission.warning };
}
