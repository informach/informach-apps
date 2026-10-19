import type { McpGrant, McpScope } from "./access.ts";
import { CHECK_CLIENT, PANEL_CLIENT } from "./ai-grants.ts";

/**
 * What a local MCP call may do with its grant (access.ts). Reads and proposals run when the grant
 * covers them; a write without the write scope asks the person first, unless an approval for
 * the open project is running. Tools the application marks `alwaysAsk` ask every time, even with
 * the write scope, except in the panel's own runs: the person asked there, inside the
 * application. Calls of the panel's runs count as the assistant's and are tied to their project.
 * A call whose grant ended while it waited (Parar, the end of the turn, a revocation) never runs.
 */

export interface ToolOutcome {
  ok: boolean;
  text: string;
  /** Pictures for the model, after the text. */
  images?: { mime: "image/png" | "image/jpeg"; data: string }[];
}

/**
 * Who a call comes from, which project it is for and the grant that made it (always set by the
 * guard; absent for calls of an application's own API assistant).
 */
export interface CallMeta {
  source: "mcp" | "assistant";
  projectId?: string;
  client?: string;
}

export type ApprovalChoice = "once" | "project" | "deny";

export interface ApprovalAnswer {
  choice: ApprovalChoice;
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

export interface GuardDeps<Name extends string = string> {
  approve(question: ApprovalQuestion): Promise<ApprovalAnswer>;
  /** `allowed` is asked again right before the call reaches the editor. */
  call(name: Name, args: unknown, meta: CallMeta, allowed: () => boolean): Promise<ToolOutcome>;
  /** Whether the grant still works (not revoked nor expired); every grant does when absent. */
  live?: (grantId: string) => boolean;
  now?: () => number;
}

export interface ToolGuardPolicy<Name extends string> {
  /** Name shown to the person, e.g. "EdiAula". */
  appName: string;
  /** What one call needs from the grant. */
  permission(name: Name, args: unknown): McpScope;
  title(name: Name): string;
  /** One line telling the person what the call would do. */
  describe(name: Name, args: unknown): string;
  /** Asked every time, even with the write scope or a running approval (not in the panel). */
  alwaysAsk?(name: Name): boolean;
  /** Names of the grant clients in the question. */
  clientNames?: Readonly<Record<string, string>>;
  /** How long "Permitir por 15 min" lasts. */
  approvalMs?: number;
}

/** How long "Permitir por 15 min neste projeto" lasts by default. */
export const PROJECT_APPROVAL_MS = 15 * 60_000;

/** Names shown in the question for the clients the suite connects itself. */
export const CLIENT_NAMES: Readonly<Record<string, string>> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  manual: "Um app de IA configurado à mão",
  legacy: "Um app de IA conectado antes desta versão",
};

const ENDED: ToolOutcome = {
  ok: false,
  text: "Este acesso terminou (a pessoa parou o pedido, o turno acabou ou a conexão foi revogada). Nada foi feito; não tente de novo.",
};

/** Every argument of a call, readable and capped so the question stays usable. */
function details(args: unknown): string {
  const text = JSON.stringify(args ?? {}, null, 2);
  return text.length > 100_000 ? `${text.slice(0, 100_000)}\n…` : text;
}

/** One line of a call for the question: the title, then the arguments cut at 240 characters. */
export function describeArguments(title: string, args: unknown): string {
  const text = JSON.stringify(args ?? {});
  const short = text.length > 240 ? `${text.slice(0, 237)}…` : text;
  return short === "{}" ? title : `${title}: ${short}`;
}

export function createToolGuard<Name extends string>(policy: ToolGuardPolicy<Name>) {
  const approvalMs = policy.approvalMs ?? PROJECT_APPROVAL_MS;
  const clientNames = { ...CLIENT_NAMES, ...policy.clientNames };
  /** Running approvals: grant id to the project and the time it ends. */
  const approvals = new Map<string, { projectId: string; until: number }>();

  function approveForProject(grantId: string, projectId: string, now = Date.now()): void {
    approvals.set(grantId, { projectId, until: now + approvalMs });
  }

  /** The project a grant may write to without asking again, if an approval is running. */
  function approvedProject(grantId: string, now = Date.now()): string | null {
    const approval = approvals.get(grantId);
    if (!approval) return null;
    if (now < approval.until) return approval.projectId;
    approvals.delete(grantId);
    return null;
  }

  async function guarded(
    grant: Pick<McpGrant, "id" | "client" | "scopes" | "projectId">,
    name: Name,
    args: unknown,
    deps: GuardDeps<Name>,
  ): Promise<ToolOutcome> {
    const live = (): boolean => deps.live?.(grant.id) ?? true;
    if (!live()) return ENDED;
    const now = deps.now?.() ?? Date.now();
    const permission = policy.permission(name, args);
    const panel = grant.client === PANEL_CLIENT;
    const source: CallMeta["source"] = panel ? "assistant" : "mcp";
    let projectId = grant.projectId;
    const always = policy.alwaysAsk?.(name) ?? false;
    if (!grant.scopes.includes(permission) || (always && !panel)) {
      // Only writes are worth asking about; the self-check never asks.
      if (permission !== "write" || grant.client === CHECK_CLIENT)
        return { ok: false, text: "Este acesso não permite essa ferramenta." };
      const running = always ? null : approvedProject(grant.id, now);
      if (running) projectId = running;
      else {
        const answer = await deps.approve({
          client: clientNames[grant.client] ?? grant.client,
          tool: name,
          title: policy.title(name),
          summary: policy.describe(name, args),
          details: details(args),
        });
        if (answer.choice === "deny" || !answer.projectId)
          return {
            ok: false,
            text: `A pessoa não autorizou esta alteração (ou não respondeu a tempo). Não tente de novo: diga o que queria fazer e peça para ela aprovar ou fazer no ${policy.appName}.`,
          };
        // The person may answer after the run was stopped: the call is not made then.
        if (!live()) return ENDED;
        if (answer.choice === "project" && !always)
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

  return { guarded, approveForProject, approvedProject };
}

export type ToolGuard<Name extends string> = ReturnType<typeof createToolGuard<Name>>;
