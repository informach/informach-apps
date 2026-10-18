import { randomUUID } from "node:crypto";
import { assertDesktopAccess, desktopIpc as ipcMain } from "@informach/edi-desktop/main";
import type { BrowserWindow } from "electron";
import type { AiToolCall, ToolOutcome } from "../shared/types.ts";

/** Long enough for the user to answer a confirmation dialog. */
const TOOL_TIMEOUT_MS = 5 * 60 * 1000;

const pending = new Map<
  string,
  { finish(r: ToolOutcome): void; runId?: string; win: BrowserWindow }
>();

ipcMain.handle("ai:result", (_e, id: string, result: ToolOutcome) => {
  pending.get(id)?.finish(result);
  pending.delete(id);
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
  const id = randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      if (!win.isDestroyed()) win.webContents.send("ai:cancel", id);
      resolve({ ok: false, text: "O EdiFoto não respondeu a tempo." });
    }, TOOL_TIMEOUT_MS);
    pending.set(id, {
      runId: context.runId,
      win,
      finish: (r) => {
        clearTimeout(timer);
        resolve(r);
      },
    });
    win.webContents.send("ai:call", { id, name, input, source, ...context } satisfies AiToolCall);
  });
}

export function cancelToolRun(runId: string): void {
  for (const [id, entry] of pending)
    if (entry.runId === runId) {
      if (!entry.win.isDestroyed()) entry.win.webContents.send("ai:cancel", id);
      entry.finish({ ok: false, text: "Pedido interrompido." });
      pending.delete(id);
    }
}
