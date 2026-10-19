import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type AiClientStatus,
  connectClient as connect,
  type LaunchOptions,
  localMcpUrl,
  type McpServerRef,
  clientStatus as statusOf,
} from "@informach/edi-desktop/ai-clients";
import { atomicWrite } from "@informach/edi-desktop/files";
import { app } from "electron";
import { personalAiPreferences } from "../shared/personalAi.ts";
import type { AiClientId } from "../shared/types.ts";

export const DEFAULT_MCP_PORT = 47331;
/** EdiFoto's MCP server, as Claude Code and Codex are told about it. */
export const MCP_SERVER: McpServerRef = { name: "edifoto", tokenEnv: "EDIFOTO_MCP_TOKEN" };

type Stored = ReturnType<typeof personalAiPreferences>;

const file = (): string => join(app.getPath("userData"), "ai.json");

export async function readStored(): Promise<Stored> {
  try {
    return personalAiPreferences(JSON.parse(await readFile(file(), "utf8")));
  } catch {
    return {};
  }
}

export async function writeStored(s: Stored): Promise<void> {
  await atomicWrite(file(), new TextEncoder().encode(JSON.stringify(s, null, 1)));
}

export const mcpUrl = localMcpUrl;

/* ----- Claude Code / Codex: the official clients (@informach/edi-desktop/ai-clients) ----- */

/**
 * The assistant uses only the person's own subscription: API keys and other providers stay out
 * of the clients' environment, and each turn checks the login first (ai-engines personalOnly).
 */
export const launchOptions = (): LaunchOptions => ({
  allowElectronRuntime: !app.isPackaged,
  personalOnly: true,
});

export const clientStatus = (port = DEFAULT_MCP_PORT): Promise<AiClientStatus[]> =>
  statusOf({ ...launchOptions(), port, serverName: MCP_SERVER.name });

/** Registers EdiFoto's MCP server in the user's Claude Code or Codex configuration. */
export const connectClient = (
  id: AiClientId,
  port: number,
): Promise<{ ok: boolean; message: string }> => connect({ id, port, serverName: MCP_SERVER.name });
