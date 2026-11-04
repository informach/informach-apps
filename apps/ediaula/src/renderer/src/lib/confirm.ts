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
  /** A third answer, between cancelling and confirming (askChoice). */
  other?: string;
}

/** true: confirm; false: cancel (also closing the dialog); "other": the third answer. */
export type ConfirmAnswer = boolean | "other";

export const useConfirmPrompt = create<{
  question: ConfirmQuestion | null;
  answer: ((choice: ConfirmAnswer) => void) | null;
}>(() => ({ question: null, answer: null }));

/**
 * Asks the person; resolves true when they confirm. A question already open is answered no, and
 * so is this one when `signal` aborts (the AI call that asked was cancelled).
 */
export async function askConfirm(
  question: ConfirmQuestion,
  signal?: AbortSignal,
): Promise<boolean> {
  return (await ask({ ...question, other: undefined }, signal)) === true;
}

/**
 * Asks the person with three answers: "confirm", "other" (the button `other`) or "cancel" (also
 * closing the dialog, or `signal` aborting).
 */
export async function askChoice(
  question: ConfirmQuestion & { other: string },
  signal?: AbortSignal,
): Promise<"confirm" | "other" | "cancel"> {
  const choice = await ask(question, signal);
  return choice === "other" ? "other" : choice ? "confirm" : "cancel";
}

function ask(question: ConfirmQuestion, signal?: AbortSignal): Promise<ConfirmAnswer> {
  useConfirmPrompt.getState().answer?.(false);
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const answer = (choice: ConfirmAnswer): void => {
      signal?.removeEventListener("abort", no);
      if (useConfirmPrompt.getState().answer === answer)
        useConfirmPrompt.setState({ question: null, answer: null });
      resolve(choice);
    };
    const no = (): void => answer(false);
    signal?.addEventListener("abort", no, { once: true });
    useConfirmPrompt.setState({ question, answer });
  });
}
