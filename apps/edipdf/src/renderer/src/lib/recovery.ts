import { type RecoveryDocument, recoverySchema } from "@shared/document-format";
import { type DocState, isDirty, toast, useApp } from "../state/store";
import { getSource } from "./pdf";

let stopAutosave: (() => Promise<void>) | undefined;
export const stopRecoveryAutosave = async (): Promise<void> => {
  await stopAutosave?.();
};

const base64 = (bytes: Uint8Array): string => {
  let value = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    value += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(value);
};
export function recoverySnapshot(
  doc: DocState,
  cache = new Map<string, string>(),
): RecoveryDocument {
  const primary = doc.content.baseSource ?? doc.primary;
  const needed = new Set(doc.content.pages.filter((page) => !page.blank).map((page) => page.src));
  if (primary) needed.add(primary);
  return recoverySchema.parse({
    version: 1,
    id: doc.id,
    name: doc.name,
    updatedAt: Date.now(),
    primary,
    originPaths: documentOriginPaths(doc),
    content: doc.content,
    draft: doc.draft ?? undefined,
    sources: [...needed].map((id) => {
      const source = getSource(id);
      if (!source) throw new Error("Uma fonte do trabalho está indisponível.");
      let data = cache.get(id);
      if (!data) {
        data = base64(source.bytes);
        cache.set(id, data);
      }
      return { id, name: source.name, data };
    }),
  });
}

export function documentOriginPaths(doc: DocState): string[] {
  return [
    ...new Set(
      [
        ...(doc.originPaths ?? []),
        doc.originalPath,
        doc.path,
        ...doc.sourceIds.map((id) => getSource(id)?.originPath),
      ].filter((path): path is string => !!path),
    ),
  ];
}

/** Debounced automatic local recovery; all writes/removals are serialized. */
export function startRecoveryAutosave(): () => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const cache = new Map<string, string>();
  const warned = new Set<string>();
  let chain = Promise.resolve();
  const enqueue = (id: string, action: () => Promise<void>) => {
    chain = chain.then(action).catch((error) => {
      if (!warned.has(id)) {
        warned.add(id);
        toast(
          `Recuperação automática indisponível: ${error instanceof Error ? error.message : "falha de gravação local"}. Salve o documento.`,
          { tone: "error", ms: 9000 },
        );
      }
    });
  };
  const off = useApp.subscribe((state, previous) => {
    const currentIds = new Set(state.docs.map((d) => d.id));
    for (const old of previous.docs)
      if (!currentIds.has(old.id)) {
        clearTimeout(timers.get(old.id));
        timers.delete(old.id);
        enqueue(old.id, () => window.api.recovery.remove(old.id));
      }
    const sources = new Set(
      state.docs.flatMap((d) => [
        d.content.baseSource ?? d.primary,
        ...d.content.pages.filter((p) => !p.blank).map((p) => p.src),
      ]),
    );
    for (const id of cache.keys()) if (!sources.has(id)) cache.delete(id);
    for (const doc of state.docs) {
      const before = previous.docs.find((d) => d.id === doc.id);
      if (
        before?.content === doc.content &&
        before?.draft === doc.draft &&
        before?.saved === doc.saved
      )
        continue;
      clearTimeout(timers.get(doc.id));
      timers.delete(doc.id);
      if (!isDirty(doc)) {
        enqueue(doc.id, () => window.api.recovery.remove(doc.id));
        continue;
      }
      timers.set(
        doc.id,
        setTimeout(() => {
          timers.delete(doc.id);
          const current = useApp.getState().docs.find((d) => d.id === doc.id);
          if (current && isDirty(current)) {
            enqueue(doc.id, async () => {
              const latest = useApp.getState().docs.find((d) => d.id === doc.id);
              if (latest && isDirty(latest)) {
                const result = await window.api.recovery.save(recoverySnapshot(latest, cache));
                if (result.versionError && !warned.has(`version:${doc.id}`)) {
                  warned.add(`version:${doc.id}`);
                  toast(
                    `Trabalho recuperável salvo; histórico de versões indisponível: ${result.versionError}`,
                    { tone: "error", ms: 9000 },
                  );
                }
              }
            });
          }
        }, 750),
      );
    }
  });
  const stop = async () => {
    off();
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    await chain;
    cache.clear();
  };
  stopAutosave = stop;
  return () => {
    if (stopAutosave === stop) stopAutosave = undefined;
    void stop();
  };
}
