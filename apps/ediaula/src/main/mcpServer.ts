import { createServer, type IncomingMessage, type Server } from "node:http";
import { authorizeLocalMcp, grantAllows, type McpGrant } from "@informach/edi-desktop/access";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { app } from "electron";
import {
  AI_TOOL_NAMES,
  AI_TOOLS,
  type AiToolName,
  describeCall,
  EDITOR_GUIDE,
  PANEL_FORBIDDEN,
  toolPermission,
} from "../shared/aiTools.ts";
import type { ApprovalAnswer } from "./aiApproval.ts";
import { approvedProject, approveForProject } from "./aiApproval.ts";
import type { CallMeta, ToolOutcome } from "./aiBridge.ts";
import { CHECK_CLIENT, PANEL_CLIENT } from "./engines.ts";

export interface McpDeps {
  call(name: string, input: unknown, meta: CallMeta): Promise<ToolOutcome>;
  approve(request: {
    client: string;
    tool: string;
    title: string;
    summary: string;
  }): Promise<ApprovalAnswer>;
}

const MCP_INSTRUCTIONS = `${EDITOR_GUIDE}

The user is watching the EdiAula window while you work: edits appear live on the timeline. Start with get_overview.`;

/** Names shown in the approval dialog for the clients EdiAula connects itself. */
const CLIENT_NAMES: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  manual: "Um app de IA configurado à mão",
  legacy: "Um app de IA conectado antes desta versão",
};

const denied = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });

/**
 * A tool call under this request's grant. Reads and proposals run when the grant covers them;
 * a write without the write scope asks the person first, unless a 15-minute approval for the
 * project is running. Calls of the chat's own runs count as the assistant's, tied to their project.
 */
async function guarded(
  grant: McpGrant,
  name: AiToolName,
  args: unknown,
  deps: McpDeps,
): Promise<ToolOutcome> {
  const permission = toolPermission(name);
  const source: CallMeta["source"] = grant.client === PANEL_CLIENT ? "assistant" : "mcp";
  let projectId = grant.projectId;
  if (!grantAllows(grant, permission)) {
    // Only writes are worth asking about; temporary tokens of EdiAula's own checks never ask.
    if (permission !== "write" || grant.client === CHECK_CLIENT)
      return { ok: false, text: "Este acesso não permite essa ferramenta." };
    const running = approvedProject(grant.id);
    if (running) projectId = running;
    else {
      const answer = await deps.approve({
        client: CLIENT_NAMES[grant.client] ?? grant.client,
        tool: name,
        title: AI_TOOLS[name].title,
        summary: describeCall(name, args),
      });
      if (answer.choice === "deny" || !answer.projectId)
        return {
          ok: false,
          text: "A pessoa não autorizou esta alteração (ou não respondeu a tempo). Não tente de novo: diga o que queria fazer e peça para ela aprovar ou fazer no EdiAula.",
        };
      if (answer.choice === "project") approveForProject(grant.id, answer.projectId);
      projectId = answer.projectId;
    }
  }
  return deps.call(name, args, {
    source,
    ...(projectId ? { projectId } : {}),
    client: grant.id,
  });
}

function buildServer(grant: McpGrant, deps: McpDeps): McpServer {
  const server = new McpServer(
    { name: "ediaula", version: app.getVersion() },
    { instructions: MCP_INSTRUCTIONS },
  );
  for (const name of AI_TOOL_NAMES) {
    // The chat's own runs stay on their lesson: they are not offered opening or creating one.
    if (grant.client === PANEL_CLIENT && PANEL_FORBIDDEN.has(name)) continue;
    const tool = AI_TOOLS[name];
    server.registerTool(
      name,
      { title: tool.title, description: tool.description, inputSchema: tool.input },
      async (args: unknown) => {
        const r = await guarded(grant, name, args, deps);
        return r.ok
          ? { content: [{ type: "text" as const, text: r.text }], isError: false }
          : denied(r.text);
      },
    );
  }
  return server;
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (c: string) => {
      data += c;
      if (data.length > 5_000_000) reject(new Error("body too large"));
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : undefined);
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

/**
 * Local MCP endpoint (streamable HTTP, stateless) for Claude Code, Claude Desktop and Codex.
 * Bound to 127.0.0.1 only. Requests carrying an Origin header (web pages) or a foreign Host
 * (DNS rebinding) are refused, so only local programs can reach it. Each request carries a
 * token whose grant decides what it may do (packages/edi-desktop/src/access.ts).
 */
export function startMcpServer(port: number, deps: McpDeps): Promise<Server> {
  const http = createServer(async (req, res) => {
    const grant = authorizeLocalMcp(req);
    if (!grant) {
      res.writeHead(403).end("MCP authentication and an active Edi license are required");
      return;
    }
    const host = req.headers.host ?? "";
    if (req.headers.origin || !/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(host)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    if (!req.url?.startsWith("/mcp")) {
      res.writeHead(404).end("not found");
      return;
    }
    try {
      const body = req.method === "POST" ? await readBody(req) : undefined;
      const server = buildServer(grant, deps);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err) {
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: (err as Error).message },
          id: null,
        }),
      );
    }
  });
  return new Promise((resolve, reject) => {
    http.once("error", reject);
    http.listen(port, "127.0.0.1", () => {
      http.off("error", reject);
      resolve(http);
    });
  });
}
