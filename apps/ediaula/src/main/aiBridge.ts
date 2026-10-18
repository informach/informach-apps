import { randomUUID } from "node:crypto";
import {
  assertDesktopAccess,
  desktopFiles,
  desktopIpc as ipcMain,
} from "@informach/edi-desktop/main";
import type { BrowserWindow } from "electron";
import { z } from "zod";
import { AI_TOOLS, callPaths, isAiToolName, toolPermission } from "../shared/aiTools.ts";
import { createToolQueue } from "../shared/toolQueue.ts";
import type { AiToolCall } from "../shared/types.ts";
import { checkAiPath } from "./aiPaths.ts";

export interface ToolOutcome {
  ok: boolean;
  text: string;
}

/** Long enough for a transcription started by the AI. */
const TOOL_TIMEOUT_MS = 20 * 60 * 1000;

const pending = new Map<string, (r: ToolOutcome) => void>();
const queue = createToolQueue();

const outcomeSchema = z.object({ ok: z.boolean(), text: z.string().max(5_000_000) });

ipcMain.handle("ai:result", (_e, rawId: unknown, rawResult: unknown) => {
  const id = z.uuid().parse(rawId);
  const result = outcomeSchema.parse(rawResult);
  pending.get(id)?.(result);
  pending.delete(id);
});

/** Who a call comes from and which project it is for (see AiToolCall). */
export type CallMeta = Pick<AiToolCall, "source" | "projectId" | "client">;

/**
 * Paths in the call, checked (shared/aiPaths.ts and aiPaths.ts) and replaced by the file they
 * resolve to, which the editor is then allowed to read. Null input means a path was refused.
 */
async function checkPaths(
  win: BrowserWindow | null,
  name: keyof typeof AI_TOOLS,
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

function send(win: BrowserWindow, call: AiToolCall): Promise<ToolOutcome> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(call.id);
      resolve({ ok: false, text: "O EdiAula não respondeu a tempo." });
    }, TOOL_TIMEOUT_MS);
    pending.set(call.id, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    win.webContents.send("ai:call", call);
  });
}

/**
 * Runs an AI tool in the renderer, where the project lives, so every edit shows up live and
 * joins the normal undo history. Writes and proposals run one at a time; reads run together but
 * wait for a write in progress (shared/toolQueue.ts).
 */
export function callTool(
  win: BrowserWindow | null,
  name: string,
  input: unknown,
  meta: CallMeta,
): Promise<ToolOutcome> {
  assertDesktopAccess();
  if (!win || win.isDestroyed())
    return Promise.resolve({ ok: false, text: "A janela do EdiAula não está aberta." });
  if (!isAiToolName(name))
    return Promise.resolve({ ok: false, text: `Ferramenta desconhecida: ${name}` });
  const parsed = AI_TOOLS[name].input.safeParse(input ?? {});
  if (!parsed.success)
    return Promise.resolve({ ok: false, text: `Parâmetros inválidos: ${parsed.error.message}` });
  const window = win;
  return queue.run(toolPermission(name) === "read" ? "read" : "write", async () => {
    if (window.isDestroyed()) return { ok: false, text: "A janela do EdiAula não está aberta." };
    const checked = await checkPaths(window, name, parsed.data as Record<string, unknown>);
    if (!("input" in checked)) return checked;
    return send(window, { id: randomUUID(), name, input: checked.input, ...meta });
  });
}
