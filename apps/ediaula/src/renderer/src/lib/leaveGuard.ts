import { create } from "zustand";
import { useProject } from "@/state/project";

export type LeaveChoice = "retry" | "copy" | "discard" | "cancel";

/** The save-failed question on screen (SaveFailedDialog), and how it is answered. */
export const useLeavePrompt = create<{
  error: string | null;
  busy: boolean;
  answer: ((choice: LeaveChoice) => void) | null;
}>(() => ({ error: null, busy: false, answer: null }));

const ask = (error: string): Promise<LeaveChoice> =>
  new Promise((resolve) => {
    useLeavePrompt.setState({
      error,
      busy: false,
      answer: (choice) => {
        useLeavePrompt.setState({ answer: null, busy: choice === "retry" || choice === "copy" });
        resolve(choice);
      },
    });
  });

let pending: Promise<boolean> | null = null;

/**
 * Before leaving the open project (going home, opening or creating another one, closing the
 * window): writes what is pending and, when that fails, asks what to do instead of losing the
 * work. Resolves true when it is safe to leave.
 */
export function confirmLeave(): Promise<boolean> {
  pending ??= (async () => {
    try {
      for (;;) {
        if (await useProject.getState().flush()) return true;
        const choice = await ask(
          useProject.getState().saveError ?? "Não foi possível salvar o projeto.",
        );
        if (choice === "discard") return true;
        if (choice === "cancel") return false;
        if (choice === "copy" && (await useProject.getState().saveCopyAs())) return true;
      }
    } finally {
      useLeavePrompt.setState({ error: null, busy: false, answer: null });
      pending = null;
    }
  })();
  return pending;
}
