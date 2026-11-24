import { randomUUID } from "node:crypto";
import { createRendererRequests, windowPort } from "@informach/edi-desktop/ai-clients";
import { assertDesktopAccess } from "@informach/edi-desktop/main";
import { AI_TOOLS } from "../shared/aiTools.js";

/**
 * Tool calls answered by the editor (@informach/edi-desktop/ai-clients): checked against the
 * tool's schema before they leave, answered once, and given up after a minute (a big edit on a
 * big project takes a while) or when the window closes. A call given up may still be applied by
 * the editor, and the assistant is told to look before repeating it.
 */
export function createBridge(getWindow) {
  const calls = createRendererRequests({
    channel: "ai:call",
    timeoutMs: 60_000,
    timeout: {
      ok: false,
      text: "O editor não respondeu em 1 minuto. A edição pode ter sido aplicada: confira com get_objects antes de repetir.",
    },
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
