import { mkdir } from "node:fs/promises";
import { createAssistantEngines } from "@informach/edi-desktop/ai-clients";
import { EDITOR_GUIDE } from "../shared/aiTools.js";

/**
 * The assistant panel through the person's own Claude Code or Codex
 * (@informach/edi-desktop/ai-clients): the message goes on standard input, each run has its own
 * token, Codex is stopped if it acts outside the editor and every run ends in 10 minutes. The
 * panel sends the recent conversation with each message, so no session is kept by the clients.
 */

/** EdiSVG's MCP server, as Claude Code and Codex are told about it. */
export const MCP_SERVER = { name: "edisvg", tokenEnv: "EDISVG_MCP_TOKEN" };
export const MCP_PORT = 47322;

/** The panel's names for the clients. */
export const PROVIDERS = { claude: "claude-code", codex: "codex" };

const CONVERSATION = "edisvg";
const TIMEOUT_MS = 10 * 60_000;

/** A client id from the panel, or an error. */
export function providerClient(provider) {
  const client = Object.hasOwn(PROVIDERS, provider) ? PROVIDERS[provider] : undefined;
  if (!client) throw new Error("Provedor inválido.");
  return client;
}

/** An event of a run in the shape the panel reads ({type, text}); null when it shows nothing. */
export function panelEvent(event) {
  switch (event.type) {
    case "text":
      return { type: "text", text: event.delta };
    case "tool":
      return event.status === "running" ? { type: "tool", text: event.title || event.name } : null;
    case "error":
      return { type: "error", text: event.message };
    case "quota":
      // Near or at the subscription limit, or billed on an API key: the person should know.
      return event.level === "ok" ? null : { type: "error", text: event.text };
    default:
      return null;
  }
}

export function createEngineRunner(workspace, url, emit, launchOptions = {}) {
  let busy = false;
  let stopping = false;
  const engines = createAssistantEngines({
    appName: "EdiSVG",
    server: MCP_SERVER,
    systemPrompt: EDITOR_GUIDE,
    workspace: () => workspace,
    toolTitle: (name) => name,
    launchOptions: () => launchOptions,
    sessions: false,
    timeoutMs: TIMEOUT_MS,
  });
  return {
    busy: () => busy,
    stop() {
      if (!busy) return;
      stopping = true;
      engines.stop(CONVERSATION);
    },
    async send({ provider, prompt, model = "" } = {}) {
      if (busy) throw new Error("Aguarde ou interrompa a resposta atual.");
      if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 32000)
        throw new Error("Mensagem inválida ou longa demais.");
      if (typeof model !== "string" || !/^[\w.:-]{0,120}$/.test(model))
        throw new Error("Modelo inválido.");
      const client = providerClient(provider);
      await mkdir(workspace, { recursive: true });
      busy = true;
      stopping = false;
      const request = {
        conversationId: CONVERSATION,
        text: prompt,
        url,
        model: model || undefined,
        // The panel's own "done" says whether the person stopped the run.
        emit: (event) => {
          const shown = panelEvent(event);
          if (shown) emit(shown);
        },
      };
      const run =
        client === "claude-code" ? engines.runClaudeCode(request) : engines.runCodex(request);
      void run
        .catch((error) => emit({ type: "error", text: `Falha ao iniciar: ${error.message}` }))
        .finally(() => {
          busy = false;
          emit({ type: "done", stopped: stopping });
        });
      return { started: true };
    },
  };
}
