import { create } from "zustand";

/**
 * A yes-or-no question to the person in the editor (ConfirmDialog), for actions an AI asked
 * that need their word: exporting despite problems found by the check before exporting.
 */

export interface ConfirmQuestion {
  title: string;
  message: string;
  /** Lines listed under the message (the problems). */
  items?: string[];
  confirm: string;
  cancel: string;
}

export const useConfirmPrompt = create<{
  question: ConfirmQuestion | null;
  answer: ((yes: boolean) => void) | null;
}>(() => ({ question: null, answer: null }));

/**
 * Asks the person; resolves true when they confirm. A question already open is answered no, and
 * so is this one when `signal` aborts (the AI call that asked was cancelled).
 */
export function askConfirm(question: ConfirmQuestion, signal?: AbortSignal): Promise<boolean> {
  useConfirmPrompt.getState().answer?.(false);
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const answer = (yes: boolean): void => {
      signal?.removeEventListener("abort", no);
      if (useConfirmPrompt.getState().answer === answer)
        useConfirmPrompt.setState({ question: null, answer: null });
      resolve(yes);
    };
    const no = (): void => answer(false);
    signal?.addEventListener("abort", no, { once: true });
    useConfirmPrompt.setState({ question, answer });
  });
}
