import { randomUUID } from "node:crypto";
import {
  assertDesktopAccess,
  desktopFiles,
  desktopIpc as ipcMain,
} from "@informach/edi-desktop/main";
import type { BrowserWindow } from "electron";
import { z } from "zod";
import {
  AI_TOOLS,
  type AiToolName,
  callPaths,
  isAiToolName,
  toolPermission,
} from "../shared/aiTools.ts";
import { createToolQueue } from "../shared/toolQueue.ts";
import type { AiToolCall } from "../shared/types.ts";
import { checkAiPath } from "./aiPaths.ts";
import type { CallMeta, ToolOutcome } from "./mcpGuard.ts";

export type { CallMeta, ToolOutcome } from "./mcpGuard.ts";

/** After this, the caller gets an answer; the queue still waits for the editor to finish. */
const TOOL_TIMEOUT_MS = 20 * 60 * 1000;

const pending = new Map<string, (r: ToolOutcome | null) => void>();
const queue = createToolQueue();

const outcomeSchema = z.object({ ok: z.boolean(), text: z.string().max(5_000_000) });

ipcMain.handle("ai:result", (_e, rawId: unknown, rawResult: unknown) => {
  const id = z.uuid().parse(rawId);
  const result = outcomeSchema.parse(rawResult);
  pending.get(id)?.(result);
  pending.delete(id);
});

/**
 * Paths in the call, checked (shared/aiPaths.ts and aiPaths.ts) and replaced by the file they
 * resolve to, which the editor is then allowed to read.
 */
async function checkPaths(
  win: BrowserWindow | null,
  name: AiToolName,
  input: Record<string, unknown>,
): Promise<{ ok: true; input: Record<string, unknown> } | ToolOutcome> {
  const found = callPaths(name, input);
  if (!found.length) return { ok: true, input };
  const checked = new Map<string, string>();
  for (const { path } of found) {
    if (checked.has(path)) continue;
    try {
      const verdict = await checkAiPath(win, path);
      if (!verdict.ok) return { ok: false, text: `Caminho recusado (${path}): ${verdict.reason}.` };
      await desktopFiles.grantRead(verdict.path);
      checked.set(path, verdict.path);
    } catch (err) {
      return {
        ok: false,
        text: `Não consegui usar ${path}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
  const out: Record<string, unknown> = { ...input };
  for (const field of new Set(found.map((f) => f.field))) {
    const value = input[field];
    out[field] = Array.isArray(value)
      ? value.map((item) => (typeof item === "string" ? (checked.get(item) ?? item) : item))
      : typeof value === "string"
        ? (checked.get(value) ?? value)
        : value;
  }
  return { ok: true, input: out };
}

/**
 * Sends a call to the editor and waits for its answer. The caller hears back after
 * TOOL_TIMEOUT_MS at most; the returned `settled` only resolves when the editor answered or its
 * window is gone, so the queue never lets another call run over one still working.
 */
function send(
  win: BrowserWindow,
  call: AiToolCall,
  answer: (r: ToolOutcome) => void,
): Promise<void> {
  return new Promise((settled) => {
    const contents = win.webContents;
    const timer = setTimeout(
      () =>
        answer({
          ok: false,
          text: "O EdiAula ainda está trabalhando nesta ferramenta. As próximas chamadas esperam ela terminar; confira o resultado com get_overview daqui a pouco.",
        }),
      TOOL_TIMEOUT_MS,
    );
    const finish = (r: ToolOutcome | null): void => {
      clearTimeout(timer);
      pending.delete(call.id);
      contents.removeListener("destroyed", gone);
      contents.removeListener("render-process-gone", gone);
      answer(
        r ?? { ok: false, text: "A janela do EdiAula fechou antes de terminar a ferramenta." },
      );
      settled();
    };
    const gone = (): void => finish(null);
    pending.set(call.id, finish);
    contents.once("destroyed", gone);
    contents.once("render-process-gone", gone);
    try {
      contents.send("ai:call", call);
    } catch {
      // The window went away between the check and the send.
      finish(null);
    }
  });
}

/**
 * Runs an AI tool in the renderer, where the project lives, so every edit shows up live and
 * joins the normal undo history. Paths are checked first (a question to the person never holds
 * the other calls); then writes and proposals run one at a time, and reads run together but
 * wait for a write in progress (shared/toolQueue.ts).
 */
export async function callTool(
  win: BrowserWindow | null,
  name: string,
  input: unknown,
  meta: CallMeta,
): Promise<ToolOutcome> {
  assertDesktopAccess();
  if (!win || win.isDestroyed()) return { ok: false, text: "A janela do EdiAula não está aberta." };
  if (!isAiToolName(name)) return { ok: false, text: `Ferramenta desconhecida: ${name}` };
  const parsed = AI_TOOLS[name].input.safeParse(input ?? {});
  if (!parsed.success) return { ok: false, text: `Parâmetros inválidos: ${parsed.error.message}` };
  const checked = await checkPaths(win, name, parsed.data as Record<string, unknown>);
  if (!("input" in checked)) return checked;
  const window = win;
  return new Promise<ToolOutcome>((answer) => {
    void queue.run(toolPermission(name) === "read" ? "read" : "write", async () => {
      if (window.isDestroyed()) {
        answer({ ok: false, text: "A janela do EdiAula não está aberta." });
        return;
      }
      await send(window, { id: randomUUID(), name, input: checked.input, ...meta }, answer);
    });
  });
}
