import { spawn } from "node:child_process";
import { isAbsolute, join } from "node:path";
import { windowsPowerShellEnvironment } from "@informach/edi-desktop/windows-powershell";
import { validateRasterImage } from "../shared/raster-image.ts";
import {
  type ScannerDevice,
  type ScannerPage,
  type ScannerReply,
  type ScannerSettings,
  type ScannerSource,
  scannerReplySchema,
  scannerRequestSchema,
  scannerSettingsSchema,
} from "../shared/scanner-format.ts";
import { WIA_SCRIPT } from "./scanner-script.ts";

function scannerError(code: string): Error {
  const messages: Record<string, string> = {
    "0x80040154": "WIA não está disponível neste Windows.",
    "0x80210002": "Há papel preso no scanner. Confira o alimentador antes de continuar.",
    "0x80210003": "O alimentador está vazio; nenhuma nova página foi adquirida.",
    "0x80210006": "O scanner está ocupado. Feche outra aquisição e tente novamente.",
    DeviceNotFound: "O scanner escolhido foi desconectado ou não está disponível no WIA.",
    SourceNotFound: "A fonte de digitalização mudou. Atualize a lista antes de adquirir páginas.",
    UnsupportedProperty: "O driver não oferece uma propriedade exigida pelo perfil local.",
    UnsupportedValue:
      "O driver não aceitou os ajustes escolhidos. Nenhum ajuste foi reduzido silenciosamente.",
    UnsupportedImage: "O driver não retornou uma imagem PNG de página única no perfil local.",
    PixelLimit: "A digitalização excede 8192 pixels por lado ou 24 megapixels.",
    ImageLimit: "A página digitalizada excede 32 MB.",
  };
  return new Error(
    messages[code] ?? `Falha na digitalização local WIA (${code}). Confira o scanner e seu driver.`,
  );
}

/** One fixed, hidden OS helper. No user-controlled code, paths, ProgIDs or shell interpolation. */
function startHelper(raw: unknown, signal: AbortSignal) {
  signal.throwIfAborted();
  const request = scannerRequestSchema.parse(raw);
  if (process.platform !== "win32") throw new Error("A digitalização local usa WIA do Windows.");
  const windows = process.env.SystemRoot;
  if (!windows || !isAbsolute(windows)) throw new Error("Diretório do Windows indisponível.");
  const child = spawn(
    join(windows, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-STA", "-Command", WIA_SCRIPT],
    { windowsHide: true, env: windowsPowerShellEnvironment(), stdio: ["pipe", "pipe", "pipe"] },
  );
  const queue: ScannerReply[] = [],
    parts: string[] = [];
  let pending:
    | {
        resolve(reply: ScannerReply): void;
        reject(error: unknown): void;
        timer: ReturnType<typeof setTimeout>;
      }
    | undefined;
  let lineLength = 0,
    errorLength = 0,
    ended = false,
    stopped: unknown;
  const reject = (error: unknown) => {
    stopped = error;
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      pending = undefined;
    }
  };
  const close = (
    error: Error = new DOMException(
      "Digitalização interrompida; confira o estado do scanner.",
      "AbortError",
    ),
  ) => {
    signal.removeEventListener("abort", abort);
    if (!ended) {
      ended = true;
      child.kill();
    }
    parts.length = 0;
    queue.length = 0;
    reject(error);
  };
  const abort = () => close();
  signal.addEventListener("abort", abort, { once: true });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    if (ended) return;
    try {
      for (let at = 0; at < chunk.length; ) {
        const end = chunk.indexOf("\n", at),
          piece = chunk.slice(at, end < 0 ? undefined : end);
        lineLength += piece.length;
        if (lineLength > 46 * 1024 * 1024) throw new Error("Resposta WIA acima do limite local.");
        parts.push(piece);
        if (end < 0) break;
        const line = parts.join("").trim();
        parts.length = 0;
        lineLength = 0;
        at = end + 1;
        if (!line) continue;
        const reply = scannerReplySchema.parse(JSON.parse(line));
        if (pending) {
          clearTimeout(pending.timer);
          const waiter = pending;
          pending = undefined;
          waiter.resolve(reply);
        } else {
          if (queue.length >= 2) throw new Error("Respostas WIA fora de sequência.");
          queue.push(reply);
        }
      }
    } catch (error) {
      close(error instanceof Error ? error : new Error("Resposta WIA inválida."));
    }
  });
  child.stderr.on("data", (chunk: string) => {
    errorLength += chunk.length;
    if (errorLength > 16384) close(new Error("O helper WIA excedeu o limite de diagnóstico."));
  });
  child.once("error", (error) => close(error));
  child.stdin.on("error", (error) => close(error));
  child.once("close", () => {
    ended = true;
    signal.removeEventListener("abort", abort);
    if (lineLength || pending)
      reject(new Error("O helper WIA encerrou sem uma resposta completa."));
  });
  child.stdin.write(`${JSON.stringify(request)}\n`);
  return {
    close,
    next() {
      signal.throwIfAborted();
      if (ended || stopped) throw stopped ?? new Error("A sessão WIA foi encerrada.");
      child.stdin.write("next\n");
    },
    read(timeout = 120000): Promise<ScannerReply> {
      const reply = queue.shift();
      if (reply) return Promise.resolve(reply);
      if (stopped || ended)
        return Promise.reject(stopped ?? new Error("A sessão WIA foi encerrada."));
      if (pending)
        return Promise.reject(new Error("Já existe uma aquisição WIA aguardando resposta."));
      return new Promise((resolve, rejectReply) => {
        const timer = setTimeout(
          () =>
            close(
              new Error(
                "O scanner excedeu o prazo de resposta. Confira seu estado antes de tentar novamente.",
              ),
            ),
          timeout,
        );
        timer.unref();
        pending = { resolve, reject: rejectReply, timer };
      });
    },
  };
}

export async function listScanners(signal: AbortSignal): Promise<ScannerDevice[]> {
  const helper = startHelper({ action: "list" }, signal);
  try {
    const reply = await helper.read(20000);
    if (reply.kind === "error") throw scannerError(reply.code);
    if (reply.kind !== "devices") throw new Error("A lista WIA retornou um contrato incompatível.");
    return reply.devices;
  } finally {
    helper.close();
  }
}
export async function describeScanner(
  deviceId: string,
  signal: AbortSignal,
): Promise<ScannerSource[]> {
  const helper = startHelper({ action: "describe", deviceId }, signal);
  try {
    const reply = await helper.read(30000);
    if (reply.kind === "error") throw scannerError(reply.code);
    if (reply.kind !== "sources")
      throw new Error("As fontes WIA retornaram um contrato incompatível.");
    return reply.sources;
  } finally {
    helper.close();
  }
}
export function createScannerSession(raw: ScannerSettings, signal: AbortSignal) {
  const settings = scannerSettingsSchema.parse(raw),
    helper = startHelper({ action: "acquire", settings }, signal);
  let pages = 0,
    busy = false,
    complete = false;
  return {
    close: helper.close,
    async next(): Promise<ScannerPage | null> {
      if (busy || complete) throw new Error("A sessão WIA já está adquirindo ou foi concluída.");
      busy = true;
      try {
        helper.next();
        const reply = await helper.read();
        if (reply.kind === "error") throw scannerError(reply.code);
        if (reply.kind === "done") {
          complete = true;
          return null;
        }
        if (reply.kind !== "page" || reply.dpi !== settings.dpi || pages >= settings.maximumPages)
          throw new Error("Página WIA fora do contrato ou da sequência local.");
        const bytes = new Uint8Array(Buffer.from(reply.png, "base64")),
          size = validateRasterImage(bytes, "png");
        if (size.width > 8192 || size.height > 8192 || size.width * size.height > 24_000_000)
          throw scannerError("PixelLimit");
        pages++;
        return { bytes, dpi: reply.dpi };
      } catch (error) {
        helper.close();
        throw error;
      } finally {
        busy = false;
      }
    },
  };
}
