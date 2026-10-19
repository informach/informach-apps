import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createAssistantEngines } from "@informach/edi-desktop/ai-clients";
import { app } from "electron";
import { AI_TOOLS, EDITOR_GUIDE, isAiToolName } from "../shared/aiTools.ts";
import type { AssistantEvent } from "../shared/types.ts";
import { launchOptions, MCP_SERVER, mcpUrl } from "./aiSettings.ts";
import { loadEngineState, saveEngineState, withRecap } from "./conversations.ts";

/**
 * In-app chat through the user's own Claude Code or Codex install, signed in with their own
 * subscription. The runs, sessions and tokens are @informach/edi-desktop/ai-clients'; EdiAula
 * gives its guide, its tool titles and where each lesson's conversation is kept.
 */

type Emit = (e: AssistantEvent) => void;

const PANEL_PROMPT = `You are the assistant in EdiAula's side panel. The user sees the editor next to this chat and watches your edits happen live. Use the ediaula tools to inspect and change the open project; don't ask the user to do things you can do with a tool. Keep answers short, in Brazilian Portuguese: what you did, what changed, and the time saved.`;

/** Empty working folder: no project files, no CLAUDE.md, nothing for the agent to read. */
export function workspace(): string {
  const dir = join(app.getPath("userData"), "ai-workspace");
  mkdirSync(dir, { recursive: true });
  return dir;
}

const engines = createAssistantEngines({
  appName: "EdiAula",
  server: MCP_SERVER,
  systemPrompt: `${EDITOR_GUIDE}\n\n${PANEL_PROMPT}`,
  workspace,
  toolTitle: (name) => (isAiToolName(name) ? AI_TOOLS[name].title : name),
  launchOptions,
  // The Claude Code session and the Codex thread of each lesson's conversation (motor.json).
  sessions: {
    load: async (engine, conversationId) => (await loadEngineState(conversationId))[engine],
    save: (engine, conversationId, session) =>
      saveEngineState(conversationId, { [engine]: session }),
  },
  recap: withRecap,
  warn: (event, detail) => console.warn(`[ediaula] ${event}`, detail),
});

/** The Stop button: the run's token is revoked, its whole process tree ends and the turn is done. */
export const stopEngineRun = (conversationId: string): boolean => engines.stop(conversationId);

/** Signed out of the computer: every run of the chat ends. */
export const stopAllEngineRuns = (): void => engines.stopAll();

export const resetEngineSession = (conversationId: string): void => engines.reset(conversationId);

export const codexFeatures = engines.codexFeatures;

/** One answer without tools (oneShot.ts). */
export const engineOneShot = engines.oneShot;

export const runClaudeCode = (
  conversationId: string,
  text: string,
  port: number,
  model: string | undefined,
  effort: string,
  emit: Emit,
): Promise<void> =>
  engines.runClaudeCode({ conversationId, text, url: mcpUrl(port), model, effort, emit });

export const runCodex = (
  conversationId: string,
  text: string,
  port: number,
  emit: Emit,
): Promise<void> => engines.runCodex({ conversationId, text, url: mcpUrl(port), emit });

/**
 * Checks whether the installed Codex stays inside the editor's tools: asked to call get_overview
 * and then to read a file holding a random code (the package's codexSelfTest).
 */
export const codexSelfTest = (
  port: number,
): Promise<{ version: string; ok: boolean; conclusive: boolean; detail: string }> =>
  engines.codexSelfTest(mcpUrl(port), "get_overview");
