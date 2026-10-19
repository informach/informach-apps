import { randomUUID } from "node:crypto";
import { createRendererRequests, windowPort } from "@informach/edi-desktop/ai-clients";
import { assertDesktopAccess } from "@informach/edi-desktop/main";
import { AI_TOOLS } from "../shared/aiTools.js";

/**
 * Tool calls answered by the editor (@informach/edi-desktop/ai-clients): checked against the
 * tool's schema before they leave, answered once, and given up after 15 s or when the window
 * closes.
 */
export function createBridge(getWindow) {
  const calls = createRendererRequests({
    channel: "ai:call",
    timeoutMs: 15000,
    timeout: { ok: false, text: "O editor não respondeu." },
    gone: { ok: false, text: "Janela fechada." },
  });
  return {
    result(id, result) {
      calls.resolve(id, result);
    },
    close() {
      calls.close({ ok: false, text: "Janela fechada." });
    },
    async call(name, input) {
      assertDesktopAccess();
      const schema = Object.hasOwn(AI_TOOLS, name) ? AI_TOOLS[name].input : undefined;
      if (!schema) return { ok: false, text: "Ferramenta desconhecida." };
      const parsed = schema.safeParse(input);
      if (!parsed.success) return { ok: false, text: "Parâmetros inválidos." };
      const win = getWindow();
      if (!win || win.isDestroyed()) return { ok: false, text: "Abra o EdiSVG." };
      return calls.request(windowPort(win), { id: randomUUID(), name, input: parsed.data }).answer;
    },
  };
}
