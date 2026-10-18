import Anthropic from "@anthropic-ai/sdk";
import type { BrowserWindow } from "electron";
import { buildRequest, type Effort, resolveModel, usageCost } from "../shared/aiModels.ts";
import {
  AI_TOOL_NAMES,
  AI_TOOLS,
  EDITOR_GUIDE,
  isAiToolName,
  PANEL_FORBIDDEN,
  toolJsonSchema,
} from "../shared/aiTools.ts";
import type { AssistantEvent } from "../shared/types.ts";
import { callTool, type ToolOutcome } from "./aiBridge.ts";
import { decryptKey, readStored, storedEffort } from "./aiSettings.ts";
import { withRecap } from "./conversations.ts";

const SYSTEM = `${EDITOR_GUIDE}

You are the assistant in EdiAula's side panel. The user sees the editor next to this chat and watches your edits happen. Use the tools to inspect and change the open project; don't ask the user to do things you can do with a tool. Keep answers short: what you did, what changed, and the time saved.`;

const MAX_TOOL_ROUNDS = 40;

type Param = Anthropic.Beta.BetaMessageParam;

const conversations = new Map<string, Param[]>();
const running = new Map<string, AbortController>();

// Opening or creating projects is for the person: the chat stays on the lesson it belongs to.
const tools: Anthropic.Beta.BetaTool[] = AI_TOOL_NAMES.filter(
  (name) => !PANEL_FORBIDDEN.has(name),
).map((name) => ({
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

/** A tool's answer for the API: its text, then the pictures it carries (get_frame). */
function resultContent(r: ToolOutcome): Anthropic.Beta.BetaToolResultBlockParam["content"] {
  if (!r.images?.length) return r.text;
  return [
    { type: "text", text: r.text },
    ...r.images.map(
      (image): Anthropic.Beta.BetaImageBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: image.mime, data: image.data },
      }),
    ),
  ];
}

/**
 * Keeps the history valid without editing what was already sent (the API checks earlier turns):
 * an assistant turn whose tool calls never got results gets error results appended.
 */
function closeDanglingTools(messages: Param[], reason: string): void {
  const last = messages[messages.length - 1];
  if (last?.role !== "assistant" || !Array.isArray(last.content)) return;
  const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
  for (const block of last.content)
    if (block.type === "tool_use")
      results.push({ type: "tool_result", tool_use_id: block.id, is_error: true, content: reason });
  if (results.length) messages.push({ role: "user", content: results });
}

/**
 * Runs one user turn: streams Claude's answer, executes the tools it calls inside the editor
 * and loops until Claude is done. History is kept per conversation (one per project, and its id
 * is the project's) and only ever grows: failures are recorded as error results.
 */
export async function sendMessage(
  win: BrowserWindow | null,
  conversationId: string,
  text: string,
  effortOverride?: Effort,
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
  const { model } = resolveModel(stored.model);
  const request = buildRequest(model, effortOverride ?? storedEffort(stored));
  const client = new Anthropic({ apiKey });
  const known = conversations.get(conversationId);
  const messages = known ?? [];
  conversations.set(conversationId, messages);
  messages.push({ role: "user", content: known ? text : await withRecap(conversationId, text) });

  running.get(conversationId)?.abort();
  const abort = new AbortController();
  running.set(conversationId, abort);
  let jsonRetries = 0;
  let tokens = 0;
  let usd: number | undefined = 0;
  const report = (): void => {
    if (tokens) emit({ type: "usage", tokens, ...(usd !== undefined ? { usd } : {}) });
  };

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const stream = client.beta.messages.stream(
        {
          ...request,
          max_tokens: 64000,
          system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
          tools,
          messages,
          // Caches the conversation so each tool round only pays for the new turn.
          cache_control: { type: "ephemeral" },
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
      const cost = usageCost(model, message.usage);
      tokens += cost.tokens;
      usd = usd === undefined || cost.usd === undefined ? undefined : usd + cost.usd;

      if (message.stop_reason === "refusal") {
        emit({
          type: "error",
          message: "O Claude não pôde atender a esse pedido. Tente reformular.",
        });
        // Recorded as declined (a partial answer is not kept), so the next message follows it.
        messages.push({
          role: "assistant",
          content: [{ type: "text", text: "(Este pedido foi recusado e não foi atendido.)" }],
        });
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
        const known = isAiToolName(use.name) ? use.name : null;
        const title = known ? AI_TOOLS[known].title : use.name;
        emit({ type: "tool", id: use.id, name: use.name, title, status: "running" });
        // Streamed inputs are not validated by the API, so check them before touching the project.
        const parsed = known ? AI_TOOLS[known].input.safeParse(use.input) : undefined;
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
        const r = await callTool(win, use.name, parsed.data, {
          source: "assistant",
          projectId: conversationId,
        });
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: resultContent(r),
          is_error: !r.ok,
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
    closeDanglingTools(messages, "O limite de rodadas de ferramentas deste pedido acabou.");
    report();
    emit({ type: "done" });
  } catch (err) {
    if (!abort.signal.aborted) emit({ type: "error", message: describeError(err) });
    // Leave the history valid for the next turn by adding to it, never removing from it.
    closeDanglingTools(
      messages,
      abort.signal.aborted
        ? "Interrompido pela pessoa."
        : "A execução foi interrompida por um erro.",
    );
    report();
    emit({ type: "done" });
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
    const model = await client.models.retrieve(resolveModel(stored.model).model);
    return { ok: true, message: `Chave válida · ${model.display_name}` };
  } catch (err) {
    return { ok: false, message: describeError(err) };
  }
}
