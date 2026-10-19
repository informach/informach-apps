import { randomUUID } from "node:crypto";
import { createRendererRequests, windowPort } from "@informach/edi-desktop/ai-clients";
import { assertDesktopAccess, desktopIpc as ipcMain } from "@informach/edi-desktop/main";
import type { BrowserWindow } from "electron";
import { z } from "zod";
import type { AiToolCall, ToolOutcome } from "../shared/types.ts";

/** Long enough for the user to answer a confirmation dialog. */
const TOOL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Tool calls waiting for the renderer (@informach/edi-desktop/ai-clients). A call that runs out
 * of time or whose request was stopped is cancelled in the editor too.
 */
const calls = createRendererRequests<AiToolCall, ToolOutcome>({
  channel: "ai:call",
  timeoutMs: TOOL_TIMEOUT_MS,
  timeout: { ok: false, text: "O EdiFoto não respondeu a tempo." },
  gone: { ok: false, text: "A janela do EdiFoto não está aberta." },
  onEnd: (port, id, how) => {
    if (how === "timeout" || how === "cancel") port.send("ai:cancel", id);
  },
});

/** The editor's answer: text and, for the image tools, one picture in base64. */
const outcomeSchema = z.object({
  ok: z.boolean(),
  text: z.string().max(5_000_000),
  image: z
    .object({
      data: z
        .string()
        .max(12_000_000)
        .regex(/^[A-Za-z0-9+/]+={0,2}$/),
      mimeType: z.enum(["image/jpeg", "image/png"]),
    })
    .optional(),
});

ipcMain.handle("ai:result", (_e, id: unknown, result: unknown) => {
  calls.resolve(z.uuid().parse(id), outcomeSchema.parse(result));
});

/**
 * Runs an AI tool in the renderer, where the document lives, so every edit shows up live and
 * joins the normal undo history.
 */
export function callTool(
  win: BrowserWindow | null,
  name: string,
  input: unknown,
  source: AiToolCall["source"],
  context: Pick<AiToolCall, "documentId" | "runId" | "workspaceId"> = {},
): Promise<ToolOutcome> {
  assertDesktopAccess();
  if (!win || win.isDestroyed())
    return Promise.resolve({ ok: false, text: "A janela do EdiFoto não está aberta." });
  return calls.request(windowPort(win), { id: randomUUID(), name, input, source, ...context })
    .answer;
}

/** Stops the calls of a request (Parar, end of the request): the editor cancels them too. */
export function cancelToolRun(runId: string): void {
  calls.cancel((call) => call.runId === runId, { ok: false, text: "Pedido interrompido." });
}
