import { withBitmapReplacement } from "@/engine/bitmaps";
import { collectDocumentBitmaps, useDoc } from "@/state/doc";
import { useUi } from "@/state/ui";
import { documentSnapshot, encodeSnapshot, parseDocument } from "./files";

export interface RecoveryDraft {
  id: "latest";
  name: string;
  savedAt: number;
  bytes: Uint8Array;
}
let database: Promise<IDBDatabase> | undefined;
let queue: Promise<void> = Promise.resolve();
function db(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("edifoto-recovery", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(new Error("Não foi possível acessar a cópia de recuperação."));
    };
  });
  return database;
}
async function transact<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("drafts", mode),
      request = operation(transaction.objectStore("drafts"));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = transaction.onabort = () =>
      reject(new Error("Não foi possível atualizar a cópia de recuperação."));
  });
}
export async function readRecovery(): Promise<RecoveryDraft | undefined> {
  await queue;
  const result: unknown = await transact("readonly", (store) => store.get("latest"));
  if (result === undefined) return undefined;
  if (
    typeof result !== "object" ||
    result === null ||
    !("bytes" in result) ||
    !(result.bytes instanceof Uint8Array) ||
    !("name" in result) ||
    typeof result.name !== "string" ||
    !("savedAt" in result) ||
    typeof result.savedAt !== "number"
  )
    throw new Error("A cópia de recuperação está danificada. Seu projeto salvo não foi alterado.");
  return { id: "latest", bytes: result.bytes, name: result.name, savedAt: result.savedAt };
}
export async function discardRecovery(): Promise<void> {
  const pending = queue.then(() => transact("readwrite", (store) => store.delete("latest")));
  queue = pending.then(
    () => {},
    () => {},
  );
  await pending;
}
export async function restoreRecovery(): Promise<void> {
  const before = useDoc.getState();
  if (before.doc) throw new Error("Feche a imagem antes de recuperar outro trabalho.");
  const draft = await readRecovery();
  if (!draft) throw new Error("Não há cópia de recuperação.");
  const parsed = await parseDocument(draft.bytes);
  if (useDoc.getState().doc || useDoc.getState().stateId !== before.stateId)
    throw new Error("A edição mudou. Tente recuperar novamente.");
  withBitmapReplacement(parsed.bitmaps, () => useDoc.getState().load(parsed.doc, { dirty: true }));
  useUi.setState((s) => ({ fitRequest: s.fitRequest + 1, tool: "move" }));
  collectDocumentBitmaps();
}
export async function flushRecovery(): Promise<void> {
  const state = useDoc.getState();
  const snapshot = state.doc && state.dirty ? documentSnapshot(state.doc) : null;
  const operation = async () => {
    if (snapshot) {
      const bytes = await encodeSnapshot(snapshot);
      await transact("readwrite", (store) =>
        store.put({ id: "latest", name: snapshot.doc.name, savedAt: Date.now(), bytes }),
      );
    } else await transact("readwrite", (store) => store.delete("latest"));
  };
  const pending = queue.then(operation, operation);
  queue = pending.then(
    () => {},
    () => {},
  );
  return pending;
}
export function startRecovery(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined,
    reported = false;
  const save = () => {
    try {
      void flushRecovery().catch(failure);
    } catch (error) {
      failure(error);
    }
  };
  const failure = (error: unknown) => {
    if (!reported)
      useUi
        .getState()
        .toast(
          error instanceof Error
            ? error.message
            : "Falha na cópia de recuperação. Salve seu projeto.",
          "error",
        );
    reported = true;
  };
  const stop = useDoc.subscribe((s, previous) => {
    if (
      s.stateId === previous.stateId &&
      s.dirty === previous.dirty &&
      s.doc?.id === previous.doc?.id
    )
      return;
    clearTimeout(timer);
    // Debounce local backup encoding; user-triggered saving remains immediate.
    timer = setTimeout(save, 1500);
  });
  return () => {
    stop();
    clearTimeout(timer);
  };
}
