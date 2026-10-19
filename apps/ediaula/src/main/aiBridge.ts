import { randomUUID } from "node:crypto";
import {
  createRendererRequests,
  createToolQueue,
  windowPort,
} from "@informach/edi-desktop/ai-clients";
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
  callPermission,
  isAiToolName,
} from "../shared/aiTools.ts";
import type { AiToolCall } from "../shared/types.ts";
import { checkAiPath } from "./aiPaths.ts";
import type { CallMeta, ToolOutcome } from "./mcpGuard.ts";

export type { CallMeta, ToolOutcome } from "./mcpGuard.ts";

/** After this, the caller gets an answer; the queue still waits for the editor to finish. */
const TOOL_TIMEOUT_MS = 20 * 60 * 1000;

/** The answer of a call whose run was stopped (Parar, end of the turn) or whose access went. */
export const NOT_ALLOWED =
  "Interrompido: o pedido foi parado pela pessoa ou o acesso desta conexão acabou antes desta ferramenta rodar. Nada foi feito.";

const queue = createToolQueue();
const calls = createRendererRequests<AiToolCall, ToolOutcome>({
  channel: "ai:call",
  timeoutMs: TOOL_TIMEOUT_MS,
  timeout: {
    ok: false,
    text: "O EdiAula ainda está trabalhando nesta ferramenta. As próximas chamadas esperam ela terminar; confira o resultado com get_overview daqui a pouco.",
  },
  gone: { ok: false, text: "A janela do EdiAula fechou antes de terminar a ferramenta." },
  // The queue never lets another call run over one the editor is still working on.
  holdAfterTimeout: true,
});

/** A picture of get_frame: PNG or JPEG in base64, at most 1568 px on its long side. */
const imageSchema = z.object({
  mime: z.enum(["image/png", "image/jpeg"]),
  data: z
    .string()
    .max(12_000_000)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
});
const outcomeSchema = z.object({
  ok: z.boolean(),
  text: z.string().max(5_000_000),
  images: z.array(imageSchema).max(4).optional(),
});

ipcMain.handle("ai:result", (_e, rawId: unknown, rawResult: unknown) => {
  calls.resolve(z.uuid().parse(rawId), outcomeSchema.parse(rawResult));
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
 * Runs an AI tool in the renderer, where the project lives, so every edit shows up live and
 * joins the normal undo history. Paths are checked first (a question to the person never holds
 * the other calls); then writes and proposals run one at a time, and reads run together but
 * wait for a write in progress (the suite's tool queue). `allowed` is asked once more when the
 * call leaves the queue: a call of a run the person stopped, or whose access was revoked or ended
 * meanwhile, never reaches the editor.
 */
export async function callTool(
  win: BrowserWindow | null,
  name: string,
  input: unknown,
  meta: CallMeta,
  allowed: () => boolean = () => true,
): Promise<ToolOutcome> {
  assertDesktopAccess();
  if (!win || win.isDestroyed()) return { ok: false, text: "A janela do EdiAula não está aberta." };
  if (!isAiToolName(name)) return { ok: false, text: `Ferramenta desconhecida: ${name}` };
  const parsed = AI_TOOLS[name].input.safeParse(input ?? {});
  if (!parsed.success) return { ok: false, text: `Parâmetros inválidos: ${parsed.error.message}` };
  if (!allowed()) return { ok: false, text: NOT_ALLOWED };
  const checked = await checkPaths(win, name, parsed.data as Record<string, unknown>);
  if (!("input" in checked)) return checked;
  const window = win;
  return new Promise<ToolOutcome>((answer) => {
    void queue.run(callPermission(name, checked.input) === "read" ? "read" : "write", async () => {
      if (window.isDestroyed()) {
        answer({ ok: false, text: "A janela do EdiAula não está aberta." });
        return;
      }
      if (!allowed()) {
        answer({ ok: false, text: NOT_ALLOWED });
        return;
      }
      const sent = calls.request(windowPort(window), {
        id: randomUUID(),
        name,
        input: checked.input,
        ...meta,
      });
      void sent.answer.then(answer);
      await sent.settled;
    });
  });
}
