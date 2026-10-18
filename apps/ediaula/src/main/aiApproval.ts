import { randomUUID } from "node:crypto";
import { desktopIpc as ipcMain } from "@informach/edi-desktop/main";
import type { BrowserWindow } from "electron";
import { z } from "zod";
import type { AiApprovalRequest } from "../shared/types.ts";
import type { ApprovalAnswer, ApprovalQuestion } from "./mcpGuard.ts";

/**
 * A write asked by an AI app that may only read and propose waits for the person: the editor
 * shows ApprovalDialog with "Permitir uma vez", "Permitir por 15 min neste projeto" and
 * "Negar". Without an answer in 60 s, it is denied.
 */

const ANSWER_TIMEOUT_MS = 60_000;

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
  question: ApprovalQuestion,
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
      ...question,
      id,
      expiresAt: Date.now() + ANSWER_TIMEOUT_MS,
    } satisfies AiApprovalRequest);
  });
}
