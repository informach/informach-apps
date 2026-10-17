import { createServer } from "node:http";
import { authorizeLocalMcp } from "@informach/edi-desktop/access";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AI_TOOLS, EDITOR_GUIDE } from "../shared/aiTools.js";
export async function startMcpServer(call, port = 47322) {
  const http = createServer(async (req, res) => {
    if (!authorizeLocalMcp(req)) {
      res.writeHead(403).end("MCP authentication and an active Edi license are required");
      return;
    }
    if (req.headers.origin || !/^127\.0\.0\.1(?::\d+)?$/.test(req.headers.host || "")) {
      res.writeHead(403).end();
      return;
    }
    if (req.url !== "/mcp") {
      res.writeHead(404).end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }
    let server, transport;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) {
          res.writeHead(413).end();
          return;
        }
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      server = new McpServer({ name: "edisvg", version: "0.2.0" }, { instructions: EDITOR_GUIDE });
      for (const [name, tool] of Object.entries(AI_TOOLS))
        server.registerTool(
          name,
          { description: tool.description, inputSchema: tool.input },
          async (args) => {
            const r = await call(name, args);
            return { content: [{ type: "text", text: r.text }], isError: !r.ok };
          },
        );
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch {
      if (!res.headersSent) res.writeHead(400);
      res.end("Requisição MCP inválida.");
    }
  });
  await new Promise((resolve, reject) => {
    http.once("error", reject);
    http.listen(port, "127.0.0.1", resolve);
  });
  return http;
}
