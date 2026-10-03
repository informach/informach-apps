type PendingLab = {
  flush: () => Promise<boolean>;
  dirty: () => boolean;
  endSession: () => void;
};
const editors = new Set<PendingLab>();

export function registerPendingLab(editor: PendingLab) {
  editors.add(editor);
  return () => {
    editors.delete(editor);
  };
}

export async function flushPendingLabs() {
  for (const editor of editors) {
    if (editor.dirty() && !(await editor.flush())) return false;
  }
  return true;
}

/** Called only after logout succeeds; old editors must not recreate private drafts. */
export function endPendingLabSession() {
  for (const editor of editors) editor.endSession();
  editors.clear();
}

export function clearLocalLearningDrafts(storage: Pick<Storage, "length" | "key" | "removeItem">) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (
      key?.startsWith("missao-lab:") ||
      key?.startsWith("missao-answer:") ||
      key?.startsWith("missao-note:") ||
      key?.startsWith("missao-setup:")
    )
      keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}
