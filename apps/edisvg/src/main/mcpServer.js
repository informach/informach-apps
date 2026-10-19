import { isGrantLive } from "@informach/edi-desktop/access";
import {
  createToolGuard,
  describeArguments,
  startLocalMcpServer,
} from "@informach/edi-desktop/mcp-server";
import { AI_TOOLS, EDITOR_GUIDE, toolPermission } from "../shared/aiTools.js";
import { MCP_PORT, MCP_SERVER } from "./engines.js";

const guard = createToolGuard({
  appName: "EdiSVG",
  permission: toolPermission,
  title: (name) => name,
  describe: describeArguments,
});

/**
 * EdiSVG's local MCP endpoint (@informach/edi-desktop/mcp-server): 127.0.0.1 only, no web
 * pages, a token per request and at most 1 MB per request. Reads run for any grant; edits need
 * the write scope (the in-app assistant's runs) or the person's approval (`approve`).
 */
export function startMcpServer({ call, approve, port = MCP_PORT, version = "0.0.0" }) {
  return startLocalMcpServer({
    port,
    name: MCP_SERVER.name,
    version,
    instructions: EDITOR_GUIDE,
    tools: AI_TOOLS,
    bodyLimit: 1024 * 1024,
    call: (grant, name, args) =>
      guard.guarded(grant, name, args, {
        approve,
        live: isGrantLive,
        call: (tool, input, _meta, allowed) =>
          allowed()
            ? call(tool, input)
            : Promise.resolve({ ok: false, text: "Este acesso terminou. Nada foi feito." }),
      }),
  });
}
