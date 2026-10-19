import { createApprovalRequests, windowPort } from "@informach/edi-desktop/ai-clients";
import { desktopIpc as ipcMain } from "@informach/edi-desktop/main";
import type { BrowserWindow } from "electron";
import { z } from "zod";
import type { ApprovalAnswer, ApprovalQuestion } from "./mcpGuard.ts";

/**
 * A write asked by an AI app that may only read and propose waits for the person: the editor
 * shows ApprovalDialog with "Permitir uma vez", "Permitir por 15 min neste projeto" and
 * "Negar". Without an answer in 60 s, it is denied (the suite's createApprovalRequests).
 */

const approvals = createApprovalRequests({ channel: "ai:approval" });

ipcMain.handle(
  "ai:approval-answer",
  (_e, rawId: unknown, rawChoice: unknown, rawProject: unknown) => {
    const id = z.uuid().parse(rawId);
    const choice = z.enum(["once", "project", "deny"]).parse(rawChoice);
    const projectId = z.string().min(1).max(200).nullable().parse(rawProject);
    approvals.answer(id, { choice, projectId });
  },
);

export const requestApproval = (
  win: BrowserWindow | null,
  question: ApprovalQuestion,
): Promise<ApprovalAnswer> => approvals.ask(windowPort(win), question);
