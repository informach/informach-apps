import type { Server } from "node:http";
import { startLocalMcpServer } from "@informach/edi-desktop/mcp-server";
import { app } from "electron";
import { AI_TOOLS, type AiToolName, EDITOR_GUIDE, PANEL_FORBIDDEN } from "../shared/aiTools.ts";
import { MCP_SERVER } from "./aiSettings.ts";
import { type GuardDeps, guarded, PANEL_CLIENT } from "./mcpGuard.ts";

export type McpDeps = Pick<GuardDeps, "approve" | "call" | "live">;

const MCP_INSTRUCTIONS = `${EDITOR_GUIDE}

The user is watching the EdiAula window while you work: edits appear live on the timeline. Start with get_overview.`;

/**
 * EdiAula's local MCP endpoint for Claude Code, Claude Desktop and Codex
 * (@informach/edi-desktop/mcp-server): 127.0.0.1 only, no web pages, a token per request whose
 * grant decides what it may do, and EdiAula's guard (mcpGuard.ts) on every tool.
 */
export function startMcpServer(port: number, deps: McpDeps): Promise<Server> {
  return startLocalMcpServer<AiToolName>({
    port,
    name: MCP_SERVER.name,
    version: app.getVersion(),
    instructions: MCP_INSTRUCTIONS,
    tools: AI_TOOLS,
    // The chat's own runs stay on their lesson: they are not offered opening or creating one.
    offered: (grant, name) => !(grant.client === PANEL_CLIENT && PANEL_FORBIDDEN.has(name)),
    call: (grant, name, args) => guarded(grant, name, args, deps),
  });
}
