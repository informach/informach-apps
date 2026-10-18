import { randomUUID } from "node:crypto";
import { desktopIpc as ipcMain } from "@informach/edi-desktop/main";
import type { BrowserWindow } from "electron";
import { z } from "zod";
import type { AiApprovalChoice, AiApprovalRequest } from "../shared/types.ts";

/**
 * A write asked by an AI app that may only read and propose waits for the person: the editor
 * shows ApprovalDialog with "Permitir uma vez", "Permitir por 15 min neste projeto" and
 * "Negar". Without an answer in 60 s, it is denied.
 */

const ANSWER_TIMEOUT_MS = 60_000;
/** How long "Permitir por 15 min neste projeto" lasts. */
export const PROJECT_APPROVAL_MS = 15 * 60_000;

export interface ApprovalAnswer {
  choice: AiApprovalChoice;
  /** Project open when the person answered: the approved call is for it only. */
  projectId: string | null;
}

const waiting = new Map<string, (answer: ApprovalAnswer) => void>();

ipcMain.handle(
  "ai:approval-answer",
  (_e, rawId: unknown, rawChoice: unknown, rawProject: unknown) => {
    const id = z.uuid().parse(rawId);
    const choice = z.enum(["once", "project", "deny"]).parse(rawChoice);
    const projectId = z.string().min(1).max(200).nullable().parse(rawProject);
    waiting.get(id)?.({ choice, projectId });
  },
);

export function requestApproval(
  win: BrowserWindow | null,
  request: Omit<AiApprovalRequest, "id" | "expiresAt">,
): Promise<ApprovalAnswer> {
  if (!win || win.isDestroyed()) return Promise.resolve({ choice: "deny", projectId: null });
  const id = randomUUID();
  const window = win;
  return new Promise((resolve) => {
    const done = (answer: ApprovalAnswer): void => {
      clearTimeout(timer);
      waiting.delete(id);
      if (!window.isDestroyed()) window.webContents.send("ai:approval", { id, closed: true });
      resolve(answer);
    };
    const timer = setTimeout(() => done({ choice: "deny", projectId: null }), ANSWER_TIMEOUT_MS);
    waiting.set(id, done);
    window.webContents.send("ai:approval", {
      ...request,
      id,
      expiresAt: Date.now() + ANSWER_TIMEOUT_MS,
    } satisfies AiApprovalRequest);
  });
}

/** "Permitir por 15 min neste projeto": grant id to the project and the time it ends. */
const projectApprovals = new Map<string, { projectId: string; until: number }>();

export function approveForProject(grantId: string, projectId: string): void {
  projectApprovals.set(grantId, { projectId, until: Date.now() + PROJECT_APPROVAL_MS });
}

/** The project a grant may write to without asking again, if a 15-minute approval is running. */
export function approvedProject(grantId: string): string | null {
  const approval = projectApprovals.get(grantId);
  if (!approval) return null;
  if (Date.now() < approval.until) return approval.projectId;
  projectApprovals.delete(grantId);
  return null;
}
