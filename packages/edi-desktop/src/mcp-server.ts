import { createServer, type IncomingMessage, type Server } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { ZodType } from "zod";
import { authorizeLocalMcp, type McpGrant } from "./access.ts";
import type { ToolOutcome } from "./mcp-guard.ts";

export { CHECK_CLIENT, localMcpUrl, type McpServerRef, PANEL_CLIENT } from "./ai-grants.ts";
export {
  type ApprovalAnswer,
  type ApprovalChoice,
  type ApprovalQuestion,
  type CallMeta,
  CLIENT_NAMES,
  createToolGuard,
  describeArguments,
  type GuardDeps,
  PROJECT_APPROVAL_MS,
  type ToolGuard,
  type ToolGuardPolicy,
  type ToolOutcome,
} from "./mcp-guard.ts";

/**
 * The local MCP endpoint of an application (streamable HTTP, stateless) for Claude Code, Claude
 * Desktop, Codex and the application's own assistant. Bound to 127.0.0.1 only. Requests
 * carrying an Origin header (web pages) or a foreign Host (DNS rebinding) are refused; each
 * request carries a token whose grant (access.ts) decides what it may do, and the application's
 * `call` (usually createToolGuard) applies it to every tool.
 */

/** One tool as the server offers it: its input is checked against `input` before `call`. */
export interface McpToolSpec {
  title?: string;
  description: string;
  input: ZodType;
}

export interface LocalMcpServerOptions<Name extends string> {
  port: number;
  /** Server name, e.g. "ediaula". */
  name: string;
  version: string;
  instructions: string;
  tools: Readonly<Record<Name, McpToolSpec>>;
  /** Whether a grant is offered a tool at all (default: every tool). */
  offered?(grant: McpGrant, name: Name): boolean;
  call(grant: McpGrant, name: Name, args: unknown): Promise<ToolOutcome>;
  /** Largest request body, in bytes (default 5 MB). */
  bodyLimit?: number;
}

export class McpBodyError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Reads a JSON body of at most `limit` bytes; stops keeping chunks as soon as it refuses. */
export function readMcpBody(req: IncomingMessage, limit = 5_000_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks: Buffer[] = [];
    const cleanup = (): void => {
      req.off("data", data);
      req.off("end", end);
      req.off("aborted", aborted);
      req.off("error", failure);
      chunks.length = 0;
    };
    const failure = (error: Error): void => {
      cleanup();
      req.resume();
      reject(error);
    };
    const aborted = (): void => failure(new McpBodyError("Request interrupted", 400));
    const data = (chunk: Buffer): void => {
      bytes += chunk.byteLength;
      if (bytes > limit) failure(new McpBodyError("Request body too large", 413));
      else chunks.push(chunk);
    };
    const end = (): void => {
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
        const parsed: unknown = text ? JSON.parse(text) : undefined;
        cleanup();
        resolve(parsed);
      } catch {
        failure(new McpBodyError("Invalid JSON request", 400));
      }
    };
    req.on("data", data);
    req.once("end", end);
    req.once("aborted", aborted);
    req.once("error", failure);
    if (Number(req.headers["content-length"]) > limit)
      failure(new McpBodyError("Request body too large", 413));
  });
}

const LOCAL_HOST = /^(127\.0\.0\.1|localhost)(:\d+)?$/i;

function buildServer<Name extends string>(
  options: LocalMcpServerOptions<Name>,
  grant: McpGrant,
): McpServer {
  const server = new McpServer(
    { name: options.name, version: options.version },
    { instructions: options.instructions },
  );
  for (const name of Object.keys(options.tools) as Name[]) {
    if (options.offered && !options.offered(grant, name)) continue;
    const tool = options.tools[name];
    server.registerTool(
      name,
      {
        ...(tool.title ? { title: tool.title } : {}),
        description: tool.description,
        inputSchema: tool.input,
      },
      async (args: unknown) => {
        const r = await options.call(grant, name, args);
        const images = (r.images ?? []).map((image) => ({
          type: "image" as const,
          data: image.data,
          mimeType: image.mime,
        }));
        return { content: [{ type: "text" as const, text: r.text }, ...images], isError: !r.ok };
      },
    );
  }
  return server;
}

export function startLocalMcpServer<Name extends string>(
  options: LocalMcpServerOptions<Name>,
): Promise<Server> {
  const http = createServer(async (req, res) => {
    if (req.headers.origin || !LOCAL_HOST.test(req.headers.host ?? "")) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const grant = authorizeLocalMcp(req);
    if (!grant) {
      res.writeHead(403).end("MCP authentication and an active Edi license are required");
      return;
    }
    if (req.url?.split("?")[0] !== "/mcp") {
      res.writeHead(404).end("not found");
      return;
    }
    // Stateless: no event stream to open (GET) nor session to end (DELETE).
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" }).end("method not allowed");
      return;
    }
    try {
      const body = await readMcpBody(req, options.bodyLimit);
      const server = buildServer(options, grant);
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
      if (!res.headersSent)
        res.writeHead(err instanceof McpBodyError ? err.status : 500, {
          "Content-Type": "application/json",
        });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: err instanceof Error ? err.message : "MCP request failed",
          },
          id: null,
        }),
      );
    }
  });
  return new Promise((resolve, reject) => {
    http.once("error", reject);
    http.listen(options.port, "127.0.0.1", () => {
      http.off("error", reject);
      resolve(http);
    });
  });
}
