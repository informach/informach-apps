import { randomUUID } from "node:crypto";
import { assertDesktopAccess, desktopIpc as ipcMain } from "@informach/edi-desktop/main";
import type { BrowserWindow } from "electron";
import type { AiToolCall, ToolOutcome } from "../shared/types.ts";

/** Long enough for the user to answer a confirmation dialog. */
const TOOL_TIMEOUT_MS = 5 * 60 * 1000;

const pending = new Map<string, (r: ToolOutcome) => void>();

ipcMain.handle("ai:result", (_e, id: string, result: ToolOutcome) => {
  pending.get(id)?.(result);
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
): Promise<ToolOutcome> {
  assertDesktopAccess();
  if (!win || win.isDestroyed())
    return Promise.resolve({ ok: false, text: "A janela do EdiFoto não está aberta." });
  const id = randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ ok: false, text: "O EdiFoto não respondeu a tempo." });
    }, TOOL_TIMEOUT_MS);
    pending.set(id, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    win.webContents.send("ai:call", { id, name, input, source } satisfies AiToolCall);
  });
}
