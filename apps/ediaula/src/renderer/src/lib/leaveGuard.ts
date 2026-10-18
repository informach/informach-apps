import { create } from "zustand";
import { useApp } from "@/state/app";
import { settleEdits, useProject } from "@/state/project";

export type LeaveChoice = "retry" | "copy" | "discard" | "cancel";

/** What to do with a draft waiting for review when leaving the lesson. */
export type DraftChoice = "apply" | "discard" | "cancel";

/** The question about a draft waiting for review (DraftLeaveDialog), and how it is answered. */
export const useDraftPrompt = create<{
  title: string | null;
  answer: ((choice: DraftChoice) => void) | null;
}>(() => ({ title: null, answer: null }));

const askDraft = (title: string): Promise<DraftChoice> =>
  new Promise((resolve) => {
    useDraftPrompt.setState({
      title,
      answer: (choice) => {
        useDraftPrompt.setState({ title: null, answer: null });
        resolve(choice);
      },
    });
  });

/**
 * A draft waiting for review lives only in memory: leaving the lesson asks to apply it, discard
 * it or stay. Resolves true when it is settled (applied or discarded).
 */
async function settleDraft(): Promise<boolean> {
  const { draft, project } = useProject.getState();
  if (!draft || !project || draft.projectId !== project.id) return true;
  const choice = await askDraft(draft.title);
  if (choice === "cancel") return false;
  if (choice === "discard") {
    useProject.getState().discardDraft();
    return true;
  }
  const r = useProject.getState().applyDraft();
  if (!r.ok)
    useApp
      .getState()
      .toast(
        "O rascunho não pôde ser aplicado: a aula mudou em pontos que ele também muda. Revise na barra acima da timeline.",
        "error",
      );
  return r.ok;
}

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
      if (!(await settleDraft())) return false;
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
      useDraftPrompt.setState({ title: null, answer: null });
      pending = null;
    }
  })();
  return pending;
}
