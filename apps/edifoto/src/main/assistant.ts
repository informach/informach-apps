import Anthropic from "@anthropic-ai/sdk";
import type { BrowserWindow } from "electron";
import {
  AI_TOOL_NAMES,
  AI_TOOLS,
  type AiToolName,
  EDITOR_GUIDE,
  toolJsonSchema,
} from "../shared/aiTools.ts";
import type { AssistantEvent } from "../shared/types.ts";
import { callTool } from "./aiBridge.ts";
import { DEFAULT_MODEL, decryptKey, readStored } from "./aiSettings.ts";

const SYSTEM = `${EDITOR_GUIDE}

You are the assistant in EdiFoto's side panel. The user sees the editor next to this chat and watches your edits happen. Use the tools to inspect and change the open image; don't ask the user to do things you can do with a tool. Keep answers short: what you did and what changed.`;

const MAX_TOOL_ROUNDS = 40;

type Param = Anthropic.Beta.BetaMessageParam;

const conversations = new Map<string, Param[]>();
const running = new Map<string, AbortController>();

const tools: Anthropic.Beta.BetaTool[] = AI_TOOL_NAMES.map((name) => ({
  name,
  description: AI_TOOLS[name].description,
  input_schema: toolJsonSchema(name) as Anthropic.Beta.BetaTool.InputSchema,
  // Stream tool inputs as they are generated; inputs are validated before running.
  eager_input_streaming: true,
}));

export function resetConversation(id: string): void {
  running.get(id)?.abort();
  conversations.delete(id);
}

export function stopConversation(id: string): void {
  running.get(id)?.abort();
}

const short = (text: string): string => {
  const line = text.split("\n").find((l) => l.trim()) ?? "";
  return line.length > 140 ? `${line.slice(0, 137)}…` : line;
};

/** Plain-language messages for the API errors a user can act on. */
function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError)
    return "A chave da API foi recusada. Confira em Configurações › Inteligência artificial.";
  if (err instanceof Anthropic.PermissionDeniedError)
    return "Esta chave não tem permissão para usar esse modelo.";
  if (err instanceof Anthropic.RateLimitError)
    return "Limite de uso da API atingido. Espere um pouco e tente de novo.";
  if (err instanceof Anthropic.BadRequestError) return `Pedido recusado pela API: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError)
    return "Sem conexão com a API da Anthropic. Verifique a internet.";
  if (err instanceof Anthropic.APIError) return `Erro da API (${err.status}): ${err.message}`;
  return (err as Error)?.message ?? String(err);
}

/**
 * Runs one user turn: streams Claude's answer, executes the tools it calls inside the editor
 * and loops until Claude is done. History is kept per conversation.
 */
export async function sendMessage(
  win: BrowserWindow | null,
  conversationId: string,
  text: string,
): Promise<void> {
  const emit = (e: AssistantEvent): void => {
    if (win && !win.isDestroyed()) win.webContents.send("assistant:event", conversationId, e);
  };
  const stored = await readStored();
  const apiKey = decryptKey(stored.apiKeyEnc);
  if (!apiKey) {
    emit({
      type: "error",
      message: "Configure a chave da API da Anthropic em Configurações › Inteligência artificial.",
    });
    emit({ type: "done" });
    return;
  }
  const model = stored.model ?? DEFAULT_MODEL;
  const client = new Anthropic({ apiKey });
  const messages = conversations.get(conversationId) ?? [];
  conversations.set(conversationId, messages);
  messages.push({ role: "user", content: text });

  running.get(conversationId)?.abort();
  const abort = new AbortController();
  running.set(conversationId, abort);
  let jsonRetries = 0;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const stream = client.beta.messages.stream(
        {
          model,
          max_tokens: 32000,
          system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
          tools,
          messages,
          // Caches the conversation so each tool round only pays for the new turn.
          cache_control: { type: "ephemeral" },
          // Haiku 4.5 does not support adaptive thinking.
          ...(model.startsWith("claude-haiku") ? {} : { thinking: { type: "adaptive" as const } }),
          // If a safety classifier declines, the API retries on the recommended fallback model.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        },
        { signal: abort.signal },
      );
      stream.on("text", (delta) => emit({ type: "text", delta }));

      let message: Anthropic.Beta.BetaMessage;
      try {
        message = await stream.finalMessage();
        jsonRetries = 0;
      } catch (err) {
        // Only an unparseable streamed tool input is retried; API errors and aborts propagate.
        if (err instanceof Anthropic.APIError || abort.signal.aborted || jsonRetries++ >= 2)
          throw err;
        continue;
      }

      if (message.stop_reason === "refusal") {
        emit({
          type: "error",
          message: "O Claude não pôde atender a esse pedido. Tente reformular.",
        });
        // Drop the declined request itself so it isn't resent with the next message.
        if (typeof messages[messages.length - 1]?.content === "string") messages.pop();
        break;
      }
      if (message.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: message.content });
        continue;
      }
      const toolUses = message.content.filter(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
      );
      if (!toolUses.length) {
        messages.push({ role: "assistant", content: message.content });
        break;
      }
      if (message.stop_reason === "max_tokens")
        throw new Error("A resposta ficou longa demais e foi cortada. Peça algo menor.");

      messages.push({ role: "assistant", content: message.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const use of toolUses) {
        const name = use.name as AiToolName;
        const title = AI_TOOLS[name]?.title ?? use.name;
        emit({ type: "tool", id: use.id, name: use.name, title, status: "running" });
        // Streamed inputs are not validated by the API, so check them before touching the document.
        const parsed = AI_TOOLS[name]?.input.safeParse(use.input);
        if (!parsed?.success) {
          results.push({
            type: "tool_result",
            tool_use_id: use.id,
            is_error: true,
            content: JSON.stringify({ INVALID_JSON: JSON.stringify(use.input) }),
          });
          emit({
            type: "tool",
            id: use.id,
            name: use.name,
            title,
            status: "error",
            summary: "parâmetros inválidos",
          });
          continue;
        }
        const r = await callTool(win, use.name, parsed.data, "assistant");
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          is_error: !r.ok,
          content: r.image
            ? [
                { type: "text", text: r.text },
                {
                  type: "image",
                  source: { type: "base64", media_type: r.image.mimeType, data: r.image.data },
                },
              ]
            : r.text,
        });
        emit({
          type: "tool",
          id: use.id,
          name: use.name,
          title,
          status: r.ok ? "done" : "error",
          summary: short(r.text),
        });
      }
      messages.push({ role: "user", content: results });
    }
    emit({ type: "done" });
  } catch (err) {
    if (!abort.signal.aborted) emit({ type: "error", message: describeError(err) });
    emit({ type: "done" });
    // Leave the history valid for the next turn: drop a dangling assistant turn with tool calls.
    const last = messages[messages.length - 1];
    if (
      last?.role === "assistant" &&
      Array.isArray(last.content) &&
      last.content.some((b) => b.type === "tool_use")
    )
      messages.pop();
  } finally {
    if (running.get(conversationId) === abort) running.delete(conversationId);
  }
}

/** A tiny request to check that the stored key works. */
export async function testKey(): Promise<{ ok: boolean; message: string }> {
  const stored = await readStored();
  const apiKey = decryptKey(stored.apiKeyEnc);
  if (!apiKey) return { ok: false, message: "Nenhuma chave salva." };
  try {
    const client = new Anthropic({ apiKey });
    const model = await client.models.retrieve(stored.model ?? DEFAULT_MODEL);
    return { ok: true, message: `Chave válida · ${model.display_name}` };
  } catch (err) {
    return { ok: false, message: describeError(err) };
  }
}
