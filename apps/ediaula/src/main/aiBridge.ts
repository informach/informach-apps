import { randomUUID } from "node:crypto";
import { assertDesktopAccess, desktopIpc as ipcMain } from "@informach/edi-desktop/main";
import type { BrowserWindow } from "electron";
import type { AiToolCall } from "../shared/types.ts";

export interface ToolOutcome {
  ok: boolean;
  text: string;
}

/** Long enough for a transcription started by the AI. */
const TOOL_TIMEOUT_MS = 20 * 60 * 1000;

const pending = new Map<string, (r: ToolOutcome) => void>();

ipcMain.handle("ai:result", (_e, id: string, result: ToolOutcome) => {
  pending.get(id)?.(result);
  pending.delete(id);
});

/**
 * Runs an AI tool in the renderer, where the project lives, so every edit shows up live and
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
    return Promise.resolve({ ok: false, text: "A janela do EdiAula não está aberta." });
  const id = randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ ok: false, text: "O EdiAula não respondeu a tempo." });
    }, TOOL_TIMEOUT_MS);
    pending.set(id, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    win.webContents.send("ai:call", { id, name, input, source } satisfies AiToolCall);
  });
}
