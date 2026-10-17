import { create } from "zustand";
import { settleEdits, useProject } from "@/state/project";

export type LeaveChoice = "retry" | "copy" | "discard" | "cancel";

/** The save-failed question on screen (SaveFailedDialog), and how it is answered. */
export const useLeavePrompt = create<{
  error: string | null;
  busy: boolean;
  /** Saving before leaving takes long enough to show it. */
  saving: boolean;
  answer: ((choice: LeaveChoice) => void) | null;
}>(() => ({ error: null, busy: false, saving: false, answer: null }));

/** How long leaving waits for the save before asking what to do. */
const SAVE_TIMEOUT_MS = 20_000;
/** Saves faster than this leave without any notice on screen. */
const NOTICE_AFTER_MS = 400;

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

/** Typed text and redrawn annotations first, then the save; "timeout" when it takes too long. */
async function saveEverything(): Promise<boolean | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const notice = setTimeout(() => useLeavePrompt.setState({ saving: true }), NOTICE_AFTER_MS);
  try {
    return await Promise.race([
      settleEdits().then(() => useProject.getState().flush()),
      new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), SAVE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    clearTimeout(notice);
    useLeavePrompt.setState({ saving: false });
  }
}

let pending: Promise<boolean> | null = null;

/**
 * Before leaving the open project (going home, opening or creating another one, closing the
 * window): writes what is pending and, when that fails or hangs, asks what to do instead of
 * losing the work. Resolves true when it is safe to leave.
 */
export function confirmLeave(): Promise<boolean> {
  pending ??= (async () => {
    try {
      for (;;) {
        const saved = await saveEverything();
        if (saved === true) return true;
        const choice = await ask(
          saved === "timeout"
            ? "O salvamento está demorando mais que o normal. Você pode esperar mais um pouco, salvar uma cópia em outro lugar ou sair sem salvar."
            : (useProject.getState().saveError ?? "Não foi possível salvar o projeto."),
        );
        if (choice === "discard") return true;
        if (choice === "cancel") return false;
        if (choice === "copy" && (await useProject.getState().saveCopyAs())) return true;
      }
    } finally {
      useLeavePrompt.setState({ error: null, busy: false, saving: false, answer: null });
      pending = null;
    }
  })();
  return pending;
}
