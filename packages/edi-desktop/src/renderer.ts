import type { EdiDesktopBridge } from "./contracts";
/** Use only for controls mounted by an explicit user action (dialog/rename).
 * A stable ref avoids stealing focus again on unrelated renders. */
export function focusOnMount(element: HTMLElement | null): void {
  if (!element) return;
  const dialog = element.closest("dialog");
  if (dialog && !dialog.open) {
    // React attaches child refs before the dialog ref. Focusing now would make
    // the input (not the opener) the browser's focus-restoration target.
    element.dataset.ediInitialFocus = "";
  } else element.focus();
}
/** Native modal lifecycle: focus trapping, background inertness and focus
 * restoration are owned by the browser, not recreated by pointer-only divs. */
export function showModalOnMount(dialog: HTMLDialogElement | null): (() => void) | undefined {
  if (!dialog) return;
  if (!dialog.open) {
    dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-edi-initial-focus]")?.focus();
  }
  return () => {
    if (dialog.open) dialog.close();
  };
}
/** Keys for stateless, derived display fragments (text/geometry/menu separators).
 * Editable entities must instead carry an ID in their model. Duplicate values
 * are disambiguated by their occurrence, not their position in the entire list. */
export function withRenderKeys<T>(
  values: readonly T[],
  identity: (value: T) => string,
): { key: string; value: T }[] {
  const occurrences = new Map<string, number>();
  return values.map((value) => {
    const id = identity(value);
    const occurrence = occurrences.get(id) ?? 0;
    occurrences.set(id, occurrence + 1);
    return { key: JSON.stringify([id, occurrence]), value };
  });
}
/** Register the editor's existing save flow, without authorizing new edits or export. */
export function registerEdiRecovery(
  saveExistingWork: Parameters<EdiDesktopBridge["onRecovery"]>[0],
) {
  return window.ediSuite.onRecovery(saveExistingWork);
}
