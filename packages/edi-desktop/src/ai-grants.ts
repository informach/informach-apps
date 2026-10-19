/**
 * Grant clients the AI infrastructure gives its own tokens (access.ts). They decide how the local
 * MCP guard treats a call: the panel's runs act for the person inside the application, the
 * Codex self-check may only read and never asks anything.
 */

/** Grant client of the runs of an application's own assistant (the side panel). */
export const PANEL_CLIENT = "painel";

/** Grant client of the Codex self-check: it may only read, and never asks the person anything. */
export const CHECK_CLIENT = "codex-check";

/** The MCP server of one application, as Claude Code and Codex are told about it. */
export interface McpServerRef {
  /** Server name in the clients' configuration and tool prefixes (`mcp__<name>`), e.g. "ediaula". */
  name: string;
  /** Environment variable that carries a run's token, e.g. "EDIAULA_MCP_TOKEN". */
  tokenEnv: string;
}

/** Address of an application's local MCP endpoint. */
export const localMcpUrl = (port: number): string => `http://127.0.0.1:${port}/mcp`;
