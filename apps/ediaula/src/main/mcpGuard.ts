import { createToolGuard, type GuardDeps as Deps } from "@informach/edi-desktop/mcp-server";
import { AI_TOOLS, type AiToolName, callPermission, describeCall } from "../shared/aiTools.ts";

export {
  type ApprovalAnswer,
  type ApprovalQuestion,
  type CallMeta,
  CHECK_CLIENT,
  PANEL_CLIENT,
  PROJECT_APPROVAL_MS,
  type ToolOutcome,
} from "@informach/edi-desktop/mcp-server";

/**
 * EdiAula's rules for local MCP calls, applied by the suite's guard
 * (@informach/edi-desktop/mcp-server). Reads and proposals run when the grant covers them; a
 * write without the write scope asks the person first, unless a 15-minute approval for the open
 * project is running. The tools of ALWAYS_ASK ask every time, even with the write scope (the
 * restricted Claude Code window), except in the chat's own runs: the person asked there, inside
 * EdiAula, and those runs cannot open or create a lesson (PANEL_FORBIDDEN). A call whose grant
 * ended while it waited (Parar, the end of the turn, a revocation) never runs.
 */

export type GuardDeps = Deps<AiToolName>;

/**
 * Always asked, even during a 15-minute approval or with the write scope: they change the open
 * lesson or bring files in. The chat's own runs are the exception (see above).
 */
export const ALWAYS_ASK = new Set<AiToolName>(["open_project", "create_project", "import_media"]);

const guard = createToolGuard<AiToolName>({
  appName: "EdiAula",
  permission: callPermission,
  title: (name) => AI_TOOLS[name].title,
  describe: describeCall,
  alwaysAsk: (name) => ALWAYS_ASK.has(name),
  clientNames: { "claude-restrito": "Claude Code só com o EdiAula" },
});

export const guarded = guard.guarded;
