import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type AiClientStatus,
  connectClient as connect,
  type Launch,
  type LaunchOptions,
  clientLaunch as launchOf,
  localMcpUrl,
  type McpServerRef,
  clientStatus as statusOf,
  clientVersion as versionOf,
} from "@informach/edi-desktop/ai-clients";
import { app, safeStorage } from "electron";
import { DEFAULT_EFFORT, type Effort, resolveModel } from "../shared/aiModels.ts";
import { parseStoredSettings, type StoredSettings } from "../shared/aiSettings.ts";
import type { AiClientId } from "../shared/types.ts";

export { locateClient } from "@informach/edi-desktop/ai-clients";

export const DEFAULT_MCP_PORT = 47321;
/** EdiAula's MCP server, as Claude Code and Codex are told about it. */
export const MCP_SERVER: McpServerRef = { name: "ediaula", tokenEnv: "EDIAULA_MCP_TOKEN" };

export type Stored = StoredSettings;

const file = (): string => join(app.getPath("userData"), "ai.json");

/**
 * The stored settings, field by field: one invalid field (an older version, a hand edit) drops
 * only itself (shared/aiSettings.ts). A missing or unreadable file is no settings; a model that
 * left the list is moved to its successor once.
 */
export async function readStored(): Promise<Stored> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file(), "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT")
      console.warn("[ediaula] ai_settings_unreadable", err instanceof Error ? err.name : err);
    return {};
  }
  const { settings: stored, dropped } = parseStoredSettings(raw);
  if (dropped.length) console.warn("[ediaula] ai_settings_fields_dropped", dropped.join(","));
  const model = resolveModel(stored.model);
  if (model.migrated) {
    stored.model = model.model;
    await writeStored(stored);
  }
  return stored;
}

export const storedEffort = (stored: Stored): Effort => stored.effort ?? DEFAULT_EFFORT;

/** Written to a file beside it and then renamed over it: a crash never leaves half a file. */
export async function writeStored(s: Stored): Promise<void> {
  const target = file();
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(s, null, 1), { flag: "wx" });
    await rename(temporary, target);
  } catch (err) {
    await rm(temporary, { force: true });
    throw err;
  }
}

export function encryptKey(key: string): string {
  if (!safeStorage.isEncryptionAvailable())
    throw new Error("O Windows não liberou a criptografia para guardar a chave.");
  return safeStorage.encryptString(key).toString("base64");
}

export function decryptKey(enc?: string): string | null {
  if (!enc) return null;
  try {
    return safeStorage.decryptString(Buffer.from(enc, "base64"));
  } catch {
    return null;
  }
}

export const mcpUrl = localMcpUrl;

/* ----- Claude Code / Codex: the official clients (@informach/edi-desktop/ai-clients) ----- */

/** Development builds can run npm scripts on Electron itself; the installed app has that off. */
export const launchOptions = (): LaunchOptions => ({ allowElectronRuntime: !app.isPackaged });

/** How to start a client binary without a shell. */
export const clientLaunch = (bin: string): Promise<Launch> => launchOf(bin, launchOptions());

/** First line of `<client> --version`. */
export const clientVersion = (bin: string): Promise<string> => versionOf(bin, launchOptions());

export const clientStatus = (port = DEFAULT_MCP_PORT): Promise<AiClientStatus[]> =>
  statusOf({ ...launchOptions(), port, serverName: MCP_SERVER.name });

/**
 * Registers EdiAula's MCP server in the user's Claude Code or Codex configuration. A client
 * already connected keeps its token unless `rotate` (Reconectar) is asked.
 */
export const connectClient = (
  id: AiClientId,
  port: number,
  rotate = false,
): Promise<{ ok: boolean; message: string }> =>
  connect({ id, port, serverName: MCP_SERVER.name, rotate });
