/* ----- Files ----- */

export interface RecentDoc {
  path: string;
  name: string;
  openedAt: number;
  /** Small JPEG data URL. */
  thumb?: string;
}

export type SaveKind = "doc" | "png" | "jpeg" | "webp";

/* ----- AI ----- */

export type AssistantEngine = "claude-code" | "codex";

export const ENGINE_LABEL: Record<AssistantEngine, string> = {
  "claude-code": "Claude Code · sua assinatura",
  codex: "Codex · sua assinatura ChatGPT",
};

export interface AiSettingsView {
  engine: AssistantEngine;
  claudeModel: string;
  mcpEnabled: boolean;
  mcpPort: number;
  mcpUrl: string;
  mcpRunning: boolean;
  mcpError?: string;
  /** Ask before the agent deletes layers. */
  confirmDeletes: boolean;
  /** Let the agent write files (export / save). */
  allowFileWrites: boolean;
}

export type AiSettingsChanges = Partial<{
  mcpEnabled: boolean;
  engine: AssistantEngine;
  claudeModel: string;
  confirmDeletes: boolean;
  allowFileWrites: boolean;
}>;

export type AiClientId = "claude-code" | "codex";

export interface AiClientStatus {
  id: AiClientId;
  name: string;
  installed: boolean;
  version?: string;
  connected: boolean;
}

export type AssistantEvent =
  | { type: "text"; delta: string }
  | {
      type: "tool";
      id: string;
      name: string;
      title: string;
      status: "running" | "done" | "error";
      summary?: string;
    }
  | { type: "quota"; level: "ok" | "warn" | "blocked"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

export interface AiToolCall {
  id: string;
  name: string;
  input: unknown;
  /** 'assistant' = in-app chat; 'mcp' = an external client (Claude Code, Codex, Claude Desktop). */
  source: "assistant" | "mcp";
  documentId?: string;
  runId?: string;
  workspaceId?: number;
}

export interface ToolOutcome {
  ok: boolean;
  text: string;
  /** Optional picture for the model to look at (base64 without the data: prefix). */
  image?: { data: string; mimeType: "image/jpeg" | "image/png" };
}

/* ----- Bridge exposed by the preload script ----- */

export interface EdiFotoApi {
  appInfo(): Promise<{ version: string }>;
  pickImages(multi: boolean): Promise<string[]>;
  pickDocument(): Promise<string | null>;
  pickSavePath(defaultName: string, kind: SaveKind): Promise<string | null>;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  recentDocs(): Promise<RecentDoc[]>;
  addRecent(doc: RecentDoc): Promise<void>;
  removeRecent(path: string): Promise<void>;
  showInFolder(path: string): Promise<void>;
  pathForFile(file: File): string;
  setDirty(dirty: boolean): void;
  onSaveBeforeClose(cb: () => void): () => void;
  onDiscardBeforeClose(cb: () => void): () => void;
  closeSaved(): Promise<void>;
  /** Files passed on the command line or with "Abrir com". */
  onOpenFiles(cb: (paths: string[]) => void): () => void;

  aiSettings(): Promise<AiSettingsView>;
  saveAiSettings(changes: AiSettingsChanges): Promise<AiSettingsView>;
  aiClients(): Promise<AiClientStatus[]>;
  connectAiClient(id: AiClientId): Promise<{ ok: boolean; message: string }>;
  assistantSend(
    conversationId: string,
    text: string,
    documentId: string,
    runId: string,
    workspaceId: number,
  ): Promise<void>;
  assistantStop(conversationId: string): Promise<void>;
  assistantReset(conversationId: string): Promise<void>;
  onAssistantEvent(cb: (conversationId: string, e: AssistantEvent) => void): () => void;
  onAiCancel(cb: (id: string) => void): () => void;
  handleAiTools(run: (call: AiToolCall) => Promise<ToolOutcome>): () => void;
}
