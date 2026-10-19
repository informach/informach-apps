import type { Server } from "node:http";
import { isGrantLive, type McpGrant } from "@informach/edi-desktop/access";
import {
  type ApprovalAnswer,
  type ApprovalQuestion,
  createToolGuard,
  describeArguments,
  startLocalMcpServer,
  type ToolOutcome,
} from "@informach/edi-desktop/mcp-server";
import { app } from "electron";
import {
  AI_TOOLS,
  type AiToolName,
  ALWAYS_ASK,
  EDITOR_GUIDE,
  toolPermission,
} from "../shared/aiTools.ts";
import type { ToolOutcome as EditorOutcome } from "../shared/types.ts";
import { MCP_SERVER } from "./aiSettings.ts";

const MCP_INSTRUCTIONS = `${EDITOR_GUIDE}

The user is watching the EdiFoto window while you work: edits appear live on the canvas and in the Layers panel. Start with get_document.`;

const guard = createToolGuard<AiToolName>({
  appName: "EdiFoto",
  permission: toolPermission,
  title: (name) => AI_TOOLS[name].title,
  describe: (name, args) => describeArguments(AI_TOOLS[name].title, args),
  alwaysAsk: (name) => ALWAYS_ASK.has(name),
});

export interface McpDeps {
  /** A write of an AI app that may only read and propose waits for the person. */
  approve(question: ApprovalQuestion): Promise<ApprovalAnswer>;
  /**
   * Runs a call the guard let through. `source` "assistant" is a run of the in-app chat, whose
   * request is the grant's project; `allowed` is false once the grant ended.
   */
  call(
    name: AiToolName,
    input: unknown,
    source: "mcp" | "assistant",
    runId: string | undefined,
    allowed: () => boolean,
  ): Promise<EditorOutcome>;
}

const forMcp = (r: EditorOutcome): ToolOutcome => ({
  ok: r.ok,
  text: r.text,
  ...(r.image ? { images: [{ mime: r.image.mimeType, data: r.image.data }] } : {}),
});

/**
 * EdiFoto's local MCP endpoint for Claude Code, Claude Desktop and Codex
 * (@informach/edi-desktop/mcp-server): 127.0.0.1 only, no web pages, a token per request whose
 * grant decides what it may do. Reads run for any grant; writes need the write scope (the
 * in-app chat's runs) or the person's approval, and opening, placing or saving files always asks
 * an app outside EdiFoto.
 */
export function startMcpServer(port: number, deps: McpDeps): Promise<Server> {
  return startLocalMcpServer<AiToolName>({
    port,
    name: MCP_SERVER.name,
    version: app.getVersion(),
    instructions: MCP_INSTRUCTIONS,
    tools: AI_TOOLS,
    call: (grant: McpGrant, name, args) =>
      guard.guarded(grant, name, args, {
        approve: deps.approve,
        live: isGrantLive,
        call: async (tool, input, meta, allowed) =>
          forMcp(
            await deps.call(
              tool,
              input,
              meta.source,
              meta.source === "assistant" ? grant.projectId : undefined,
              allowed,
            ),
          ),
      }),
  });
}
