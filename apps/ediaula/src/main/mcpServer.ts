import { createServer, type IncomingMessage, type Server } from "node:http";
import { authorizeLocalMcp } from "@informach/edi-desktop/access";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { app } from "electron";
import { AI_TOOL_NAMES, AI_TOOLS, EDITOR_GUIDE } from "../shared/aiTools.ts";
import type { ToolOutcome } from "./aiBridge.ts";

type Call = (name: string, input: unknown) => Promise<ToolOutcome>;

const MCP_INSTRUCTIONS = `${EDITOR_GUIDE}

The user is watching the EdiAula window while you work: edits appear live on the timeline. Start with get_overview.`;

function buildServer(call: Call): McpServer {
  const server = new McpServer(
    { name: "ediaula", version: app.getVersion() },
    { instructions: MCP_INSTRUCTIONS },
  );
  for (const name of AI_TOOL_NAMES) {
    const tool = AI_TOOLS[name];
    server.registerTool(
      name,
      { title: tool.title, description: tool.description, inputSchema: tool.input },
      async (args: unknown) => {
        const r = await call(name, args);
        return { content: [{ type: "text" as const, text: r.text }], isError: !r.ok };
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
 * (DNS rebinding) are refused, so only local programs can reach it.
 */
export function startMcpServer(port: number, call: Call): Promise<Server> {
  const http = createServer(async (req, res) => {
    if (!authorizeLocalMcp(req)) {
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
      const server = buildServer(call);
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
