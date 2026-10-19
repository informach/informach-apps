import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createAssistantEngines, type EngineEvent } from "@informach/edi-desktop/ai-clients";
import { app } from "electron";
import { AI_TOOL_NAMES, AI_TOOLS, EDITOR_GUIDE } from "../shared/aiTools.ts";
import type { AssistantEvent } from "../shared/types.ts";
import { launchOptions, MCP_SERVER, mcpUrl } from "./aiSettings.ts";

/**
 * In-app chat through the user's own Claude Code or Codex install, signed in with their own
 * subscription (@informach/edi-desktop/ai-clients): the message goes on standard input, each run
 * has its own token tied to the request, and Codex is stopped if it acts outside the editor.
 */

type Emit = (e: AssistantEvent) => void;

const PANEL_PROMPT = `You are the assistant in EdiFoto's side panel. The user sees the editor next to this chat and watches your edits happen live. Use the edifoto tools to inspect and change the open image; don't ask the user to do things you can do with a tool. Keep answers short, in Brazilian Portuguese: what you did and what changed.`;

/** Empty working folder: no project files, no CLAUDE.md, nothing for the agent to read. */
function workspace(): string {
  const dir = join(app.getPath("userData"), "ai-workspace");
  mkdirSync(dir, { recursive: true });
  return dir;
}

const isToolName = (name: string): name is (typeof AI_TOOL_NAMES)[number] =>
  (AI_TOOL_NAMES as readonly string[]).includes(name);

const engines = createAssistantEngines({
  appName: "EdiFoto",
  server: MCP_SERVER,
  systemPrompt: `${EDITOR_GUIDE}\n\n${PANEL_PROMPT}`,
  workspace,
  toolTitle: (name) => (isToolName(name) ? AI_TOOLS[name].title : name),
  launchOptions,
  personalOnly: true,
  warn: (event, detail) => console.warn(`[edifoto] ${event}`, detail),
});

/** The panel shows text, tools, quota and errors; the use of tokens is not shown in EdiFoto. */
const panel =
  (emit: Emit) =>
  (event: EngineEvent): void => {
    if (event.type !== "usage") emit(event);
  };

export const stopEngineRun = (conversationId: string): boolean => engines.stop(conversationId);

export const resetEngineSession = (conversationId: string): void => engines.reset(conversationId);

/**
 * One turn of the chat. The run's token is tied to `runId` (the grant's project), so the MCP
 * server knows which request a call belongs to; `check` gives up when the request was stopped.
 */
export function runClaudeCode(
  conversationId: string,
  text: string,
  port: number,
  model: string | undefined,
  emit: Emit,
  runId: string,
  check: () => void,
): Promise<void> {
  return engines.runClaudeCode({
    conversationId,
    text,
    url: mcpUrl(port),
    model,
    emit: panel(emit),
    grantProject: runId,
    check,
  });
}

export function runCodex(
  conversationId: string,
  text: string,
  port: number,
  emit: Emit,
  runId: string,
  check: () => void,
): Promise<void> {
  return engines.runCodex({
    conversationId,
    text,
    url: mcpUrl(port),
    emit: panel(emit),
    grantProject: runId,
    check,
  });
}
