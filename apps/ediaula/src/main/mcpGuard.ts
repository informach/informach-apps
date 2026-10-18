import type { McpGrant } from "@informach/edi-desktop/access";
import { AI_TOOLS, type AiToolName, callPermission, describeCall } from "../shared/aiTools.ts";
import type { AiApprovalChoice, AiToolCall, ToolImage } from "../shared/types.ts";

/**
 * What a local MCP request may do with its grant (packages/edi-desktop/src/access.ts). Reads
 * and proposals run when the grant covers them; a write without the write scope asks the person
 * first, unless a 15-minute approval for the open project is running. The tools of ALWAYS_ASK
 * ask every time, even with the write scope (the restricted Claude Code window), except in the
 * chat's own runs: the person asked there, inside EdiAula, and those runs cannot open or create
 * a lesson (PANEL_FORBIDDEN). Calls of the chat's own runs count as the assistant's and are tied
 * to their project. A call whose grant ended while it waited (Parar, the end of the turn, a
 * revocation) never runs.
 */

export interface ToolOutcome {
  ok: boolean;
  text: string;
  /** Pictures for the model (get_frame), after the text. */
  images?: ToolImage[];
}

/** Who a call comes from and which project it is for (see AiToolCall). */
export type CallMeta = Pick<AiToolCall, "source" | "projectId" | "client">;

/** Grant client of the chat's own runs. */
export const PANEL_CLIENT = "painel";
/** Grant client of the Codex self-check: it may only read, and never asks the person anything. */
export const CHECK_CLIENT = "codex-check";
/** How long "Permitir por 15 min neste projeto" lasts. */
export const PROJECT_APPROVAL_MS = 15 * 60_000;
/**
 * Always asked, even during a 15-minute approval or with the write scope: they change the open
 * lesson or bring files in. The chat's own runs are the exception (see above).
 */
export const ALWAYS_ASK = new Set<AiToolName>(["open_project", "create_project", "import_media"]);

export interface ApprovalAnswer {
  choice: AiApprovalChoice;
  /** Project open when the person answered: the approved call is for it only. */
  projectId: string | null;
}

export interface ApprovalQuestion {
  client: string;
  tool: string;
  title: string;
  summary: string;
  /** Every argument of the call, as sent. */
  details: string;
}

export interface GuardDeps {
  approve(question: ApprovalQuestion): Promise<ApprovalAnswer>;
  /** `allowed` is asked again right before the call reaches the editor (aiBridge.callTool). */
  call(
    name: AiToolName,
    args: unknown,
    meta: CallMeta,
    allowed: () => boolean,
  ): Promise<ToolOutcome>;
  /** Whether the grant still works (not revoked nor expired); every grant does when absent. */
  live?: (grantId: string) => boolean;
  now?: () => number;
}

const ENDED: ToolOutcome = {
  ok: false,
  text: "Este acesso terminou (a pessoa parou o pedido, o turno acabou ou a conexão foi revogada). Nada foi feito; não tente de novo.",
};

/** Names shown in the approval dialog for the clients EdiAula connects itself. */
const CLIENT_NAMES: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  manual: "Um app de IA configurado à mão",
  "claude-restrito": "Claude Code só com o EdiAula",
  legacy: "Um app de IA conectado antes desta versão",
};

/** "Permitir por 15 min neste projeto": grant id to the project and the time it ends. */
const projectApprovals = new Map<string, { projectId: string; until: number }>();

export function approveForProject(grantId: string, projectId: string, now = Date.now()): void {
  projectApprovals.set(grantId, { projectId, until: now + PROJECT_APPROVAL_MS });
}

/** The project a grant may write to without asking again, if a 15-minute approval is running. */
export function approvedProject(grantId: string, now = Date.now()): string | null {
  const approval = projectApprovals.get(grantId);
  if (!approval) return null;
  if (now < approval.until) return approval.projectId;
  projectApprovals.delete(grantId);
  return null;
}

/** Every argument of a call, readable and capped so the dialog stays usable. */
function details(args: unknown): string {
  const text = JSON.stringify(args ?? {}, null, 2);
  return text.length > 100_000 ? `${text.slice(0, 100_000)}\n…` : text;
}

export async function guarded(
  grant: Pick<McpGrant, "id" | "client" | "scopes" | "projectId">,
  name: AiToolName,
  args: unknown,
  deps: GuardDeps,
): Promise<ToolOutcome> {
  const live = (): boolean => deps.live?.(grant.id) ?? true;
  if (!live()) return ENDED;
  const now = deps.now?.() ?? Date.now();
  const permission = callPermission(name, args);
  const source: CallMeta["source"] = grant.client === PANEL_CLIENT ? "assistant" : "mcp";
  let projectId = grant.projectId;
  const alwaysAsk = ALWAYS_ASK.has(name) && grant.client !== PANEL_CLIENT;
  if (!grant.scopes.includes(permission) || alwaysAsk) {
    // Only writes are worth asking about; the self-check never asks.
    if (permission !== "write" || grant.client === CHECK_CLIENT)
      return { ok: false, text: "Este acesso não permite essa ferramenta." };
    const running = ALWAYS_ASK.has(name) ? null : approvedProject(grant.id, now);
    if (running) projectId = running;
    else {
      const answer = await deps.approve({
        client: CLIENT_NAMES[grant.client] ?? grant.client,
        tool: name,
        title: AI_TOOLS[name].title,
        summary: describeCall(name, args),
        details: details(args),
      });
      if (answer.choice === "deny" || !answer.projectId)
        return {
          ok: false,
          text: "A pessoa não autorizou esta alteração (ou não respondeu a tempo). Não tente de novo: diga o que queria fazer e peça para ela aprovar ou fazer no EdiAula.",
        };
      // The person may answer after the run was stopped: the call is not made then.
      if (!live()) return ENDED;
      if (answer.choice === "project" && !ALWAYS_ASK.has(name))
        approveForProject(grant.id, answer.projectId, now);
      projectId = answer.projectId;
    }
  }
  return deps.call(
    name,
    args,
    { source, ...(projectId ? { projectId } : {}), client: grant.id },
    live,
  );
}
