import { randomUUID } from "node:crypto";
import { assertDesktopAccess } from "@informach/edi-desktop/main";
import { AI_TOOLS } from "../shared/aiTools.js";
export function createBridge(getWindow) {
  const pending = new Map();
  return {
    result(id, result) {
      const entry = pending.get(id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(id);
      entry.resolve(result);
    },
    close() {
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.resolve({ ok: false, text: "Janela fechada." });
      }
      pending.clear();
    },
    async call(name, input) {
      assertDesktopAccess();
      const schema = AI_TOOLS[name]?.input;
      if (!schema) return { ok: false, text: "Ferramenta desconhecida." };
      const parsed = schema.safeParse(input);
      if (!parsed.success) return { ok: false, text: "Parâmetros inválidos." };
      const win = getWindow();
      if (!win || win.isDestroyed()) return { ok: false, text: "Abra o EdiSVG." };
      return new Promise((resolve) => {
        const id = randomUUID();
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve({ ok: false, text: "O editor não respondeu." });
        }, 15000);
        pending.set(id, { resolve, timer });
        win.webContents.send("ai:call", { id, name, input: parsed.data });
      });
    },
  };
}
