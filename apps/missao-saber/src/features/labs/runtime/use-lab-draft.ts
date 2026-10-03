"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { saveLabAction } from "./actions";
import { loadTool } from "./modules";
import { registerPendingLab } from "./pending-work";
import type { LabExecutionView } from "./repository";
import { type LabDocument, labDocumentSchema } from "./schemas";
import { type ToolFamilyId, type ToolModule, toolFamilySchema } from "./types";

const legacyDraftSchema = z.object({
  revision: z.number().int().positive(),
  document: labDocumentSchema,
});
const storedDraftSchema = legacyDraftSchema.extend({
  format: z.literal(2),
  writerId: z.string().uuid(),
  writeId: z.string().uuid(),
  profileId: z.string().uuid(),
  executionId: z.string().uuid(),
  experienceId: z.string().min(1).max(200),
  version: z.number().int().positive(),
  family: toolFamilySchema,
  mode: z.string().min(1).max(100),
  grade: z.number().int().min(1).max(12),
  updatedAt: z.number().int().nonnegative(),
});
type DraftScope = {
  id: string;
  profileId: string;
  grade: number;
  experience: { id: string; version: number; family: ToolFamilyId; mode: string };
};
type DraftStorage = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;
export type RecoverableLabDraft = z.infer<typeof legacyDraftSchema> & {
  key: string;
  raw: string;
  updatedAt: number;
};

function validateDraftDocument(
  scope: DraftScope,
  document: LabDocument,
  tool: ToolModule,
): LabDocument {
  if (tool.family !== scope.experience.family || !tool.modes.includes(scope.experience.mode))
    throw new Error("A ferramenta deste rascunho mudou.");
  const launch = {
    family: scope.experience.family,
    mode: scope.experience.mode,
    grade: scope.grade,
    variant: 0 as const,
  };
  return {
    ...document,
    state: tool.parse(launch, document.state),
    transferState: tool.parse({ ...launch, variant: 1 }, document.transferState),
    comparison: document.comparison === null ? null : tool.parse(launch, document.comparison),
  };
}

/** Every mounted editor owns one key. Reload discovers earlier writers; it never adopts their keys. */
export class LabDraftStorage {
  readonly prefix: string;
  readonly ownKey: string;
  readonly legacyKey: string;
  constructor(
    private storage: DraftStorage,
    private scope: DraftScope,
    private writerId: string,
    private isActive: () => boolean = () => true,
  ) {
    z.string().uuid().parse(writerId);
    this.prefix = `missao-lab:v2:${scope.profileId}:${scope.id}:`;
    this.ownKey = `${this.prefix}draft:${writerId}`;
    this.legacyKey = `missao-lab:v1:${scope.profileId}:${scope.id}`;
  }
  write(revision: number, document: LabDocument, updatedAt = Date.now()) {
    if (!this.isActive()) return;
    const value = storedDraftSchema.parse({
      format: 2,
      writerId: this.writerId,
      writeId: crypto.randomUUID(),
      profileId: this.scope.profileId,
      executionId: this.scope.id,
      experienceId: this.scope.experience.id,
      version: this.scope.experience.version,
      family: this.scope.experience.family,
      mode: this.scope.experience.mode,
      grade: this.scope.grade,
      revision,
      document,
      updatedAt,
    });
    this.storage.setItem(this.ownKey, JSON.stringify(value));
  }
  clearOwn() {
    this.storage.removeItem(this.ownKey);
  }
  private async acknowledgmentKey(key: string, raw: string) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${key}\n${raw}`),
    );
    const hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return `${this.prefix}handled:${hash}`;
  }
  /** Acknowledging an exact snapshot does not erase another writer or hide their later edits. */
  async acknowledge(draft: RecoverableLabDraft) {
    const key = await this.acknowledgmentKey(draft.key, draft.raw);
    if (this.isActive()) this.storage.setItem(key, "1");
  }
  async revalidate(draft: RecoverableLabDraft, tool: ToolModule) {
    if (this.storage.getItem(draft.key) !== draft.raw)
      throw new Error(
        "Outra aba atualizou este rascunho. Confira a versão mais recente antes de recuperar.",
      );
    return this.parse(draft.key, draft.raw, tool);
  }
  private parse(key: string, raw: string, tool: ToolModule): RecoverableLabDraft {
    // Earlier clients stored no tool metadata. Only version 1 can adopt that format;
    // all three states must still pass the current mode-specific validators.
    if (key === this.legacyKey) {
      if (this.scope.experience.version !== 1)
        throw new Error("O rascunho antigo não informa uma versão compatível.");
      const value = legacyDraftSchema.parse(JSON.parse(raw));
      return {
        ...value,
        document: validateDraftDocument(this.scope, value.document, tool),
        key,
        raw,
        updatedAt: 0,
      };
    }
    const value = storedDraftSchema.parse(JSON.parse(raw));
    if (
      key !== `${this.prefix}draft:${value.writerId}` ||
      value.profileId !== this.scope.profileId ||
      value.executionId !== this.scope.id ||
      value.experienceId !== this.scope.experience.id ||
      value.version !== this.scope.experience.version ||
      value.family !== this.scope.experience.family ||
      value.mode !== this.scope.experience.mode ||
      value.grade !== this.scope.grade
    )
      throw new Error("O rascunho pertence a outra configuração ou versão da experiência.");
    return {
      revision: value.revision,
      document: validateDraftDocument(this.scope, value.document, tool),
      key,
      raw,
      updatedAt: value.updatedAt,
    };
  }
  async discover(accountDocument: string, tool: ToolModule) {
    const snapshots: { key: string; raw: string }[] = [];
    // Snapshot the key list before asynchronous validation; other writers stay independent.
    for (let index = 0; index < this.storage.length; index++) {
      const key = this.storage.key(index);
      if (
        !key ||
        key === this.ownKey ||
        !(key === this.legacyKey || key.startsWith(`${this.prefix}draft:`))
      )
        continue;
      const raw = this.storage.getItem(key);
      if (raw !== null) snapshots.push({ key, raw });
    }
    const drafts: RecoverableLabDraft[] = [];
    let incompatible = 0;
    for (const { key, raw } of snapshots) {
      const acknowledgment = await this.acknowledgmentKey(key, raw);
      if (!this.isActive()) return { drafts: [], incompatible: 0 };
      if (this.storage.getItem(acknowledgment)) continue;
      let draft: RecoverableLabDraft;
      try {
        draft = this.parse(key, raw, tool);
      } catch {
        incompatible++;
        continue;
      }
      if (JSON.stringify(draft.document) === accountDocument) {
        await this.acknowledge(draft);
        continue;
      }
      drafts.push(draft);
    }
    drafts.sort((a, b) => b.updatedAt - a.updatedAt || b.key.localeCompare(a.key));
    return { drafts, incompatible };
  }
}

export function useLabDraft(initial: LabExecutionView) {
  const router = useRouter();
  const [document, setDocument] = useState(initial.document);
  const [status, setStatus] = useState("Salvo na conta.");
  const [conflict, setConflict] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [recoveries, setRecoveries] = useState<RecoverableLabDraft[]>([]);
  const [recovering, setRecovering] = useState(false);
  const latest = useRef(initial.document);
  const saved = useRef(JSON.stringify(initial.document));
  const revision = useRef(initial.revision);
  const updatedAt = useRef(initial.updatedAt);
  const blocked = useRef(false);
  const sessionEnded = useRef(false);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const mounted = useRef(true);
  const restored = useRef<RecoverableLabDraft | null>(null);
  const recoveryInFlight = useRef(false);
  const storage = useRef<LabDraftStorage | null>(null);
  const [writerId] = useState(() => crypto.randomUUID());
  const getStorage = useCallback(() => {
    if (!storage.current)
      storage.current = new LabDraftStorage(
        localStorage,
        initial,
        writerId,
        () => !sessionEnded.current,
      );
    return storage.current;
  }, [initial, writerId]);
  const persist = useCallback(
    (value: LabDocument) => {
      if (sessionEnded.current) return;
      try {
        getStorage().write(revision.current, value);
      } catch {
        if (mounted.current)
          setStatus(
            "Não foi possível guardar neste aparelho. Mantenha a página aberta até salvar na conta.",
          );
      }
    },
    [getStorage],
  );
  const update = useCallback(
    (value: LabDocument) => {
      latest.current = value;
      setDocument(value);
      setDirty(JSON.stringify(value) !== saved.current);
      setStatus(
        blocked.current
          ? "As versões são diferentes. Preserve suas mudanças em uma cópia."
          : "Mudanças aguardando salvamento…",
      );
      persist(value);
    },
    [persist],
  );
  const refreshRecoveries = useCallback(async () => {
    const tool = await loadTool(initial.experience.family);
    const { drafts, incompatible } = await getStorage().discover(saved.current, tool);
    if (!mounted.current) return;
    setRecoveries(
      drafts.filter(
        (draft) => draft.raw !== restored.current?.raw || draft.key !== restored.current?.key,
      ),
    );
    if (incompatible)
      setStatus(
        `${incompatible} rascunho(s) antigo(s) ou incompatível(is) continuam preservados neste aparelho, mas não podem ser abertos nesta versão. A montagem atual não foi alterada.`,
      );
  }, [getStorage, initial.experience.family]);
  const flush = useCallback((): Promise<boolean> => {
    if (sessionEnded.current) return Promise.resolve(false);
    if (inFlight.current) return inFlight.current;
    if (blocked.current) return Promise.resolve(false);
    const task = (async () => {
      for (;;) {
        while (JSON.stringify(latest.current) !== saved.current) {
          const sent = latest.current;
          if (mounted.current) setStatus("Salvando na conta…");
          try {
            const result = await saveLabAction({
              profileId: initial.profileId,
              id: initial.id,
              revision: revision.current,
              document: sent,
            });
            if (sessionEnded.current) return false;
            if (!result.ok) {
              if (result.code === "CONFLICT") blocked.current = true;
              if (mounted.current) {
                setStatus(result.error);
                setConflict(blocked.current);
              }
              return false;
            }
            revision.current = result.data.revision;
            updatedAt.current = result.data.updatedAt;
            saved.current = JSON.stringify(sent);
            persist(latest.current);
          } catch {
            if (mounted.current)
              setStatus(
                "Sem conexão para salvar na conta. Mantenha a página aberta e tente novamente; o rascunho local será recuperado quando disponível.",
              );
            return false;
          }
        }
        const source = restored.current;
        let localWarning = "";
        if (source && JSON.stringify(source.document) === saved.current) {
          try {
            await getStorage().acknowledge(source);
            restored.current = null;
          } catch {
            localWarning =
              " O rascunho de origem continua preservado e pode ser oferecido novamente.";
          }
        }
        // Acknowledging uses Web Crypto asynchronously; edits made meanwhile still need saving.
        if (JSON.stringify(latest.current) !== saved.current) continue;
        if (mounted.current) {
          setDirty(false);
          setStatus(`Salvo na conta.${localWarning}`);
        }
        try {
          getStorage().clearOwn();
        } catch {
          if (mounted.current)
            setStatus(
              "Salvo na conta. Não foi possível remover a cópia local deste editor; ela permanece preservada.",
            );
        }
        return true;
      }
    })();
    inFlight.current = task;
    void task.finally(() => {
      inFlight.current = null;
    });
    return task;
  }, [getStorage, initial.id, initial.profileId, persist]);
  useEffect(() => {
    const dirty = () => !sessionEnded.current && JSON.stringify(latest.current) !== saved.current;
    const unregister = registerPendingLab({
      flush,
      dirty,
      endSession: () => {
        sessionEnded.current = true;
      },
    });
    const navigate = (event: MouseEvent) => {
      if (
        !dirty() ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.target ||
        anchor.hasAttribute("download")
      )
        return;
      const url = new URL(anchor.href);
      if (
        url.origin !== window.location.origin ||
        url.pathname + url.search === window.location.pathname + window.location.search
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void flush().then((ok) => {
        if (ok) router.push(url.pathname + url.search + url.hash);
      });
    };
    window.document.addEventListener("click", navigate, true);
    return () => {
      unregister();
      window.document.removeEventListener("click", navigate, true);
    };
  }, [flush, router]);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    void refreshRecoveries().catch(() => {
      if (active && mounted.current)
        setStatus(
          "Não foi possível verificar os rascunhos deste aparelho. A versão da conta está aberta; os rascunhos não foram apagados.",
        );
    });
    const guard = (event: BeforeUnloadEvent) => {
      if (!sessionEnded.current && JSON.stringify(latest.current) !== saved.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => {
      active = false;
      mounted.current = false;
      window.removeEventListener("beforeunload", guard);
    };
  }, [refreshRecoveries]);
  useEffect(() => {
    if (!dirty || conflict || JSON.stringify(document) === saved.current) return;
    const timer = setTimeout(() => {
      void flush();
    }, 700);
    return () => clearTimeout(timer);
  }, [document, dirty, conflict, flush]);
  const recovery = recoveries[0] ?? null;
  async function restore() {
    if (!recovery || recoveryInFlight.current) return false;
    if (inFlight.current) {
      setStatus("Aguarde o salvamento em andamento antes de recuperar outro rascunho.");
      return false;
    }
    recoveryInFlight.current = true;
    setRecovering(true);
    const before = JSON.stringify(latest.current);
    try {
      const tool = await loadTool(initial.experience.family);
      const candidate = await getStorage().revalidate(recovery, tool);
      if (!mounted.current) return false;
      if (before !== JSON.stringify(latest.current) || inFlight.current) {
        setStatus(
          "A montagem mudou enquanto o rascunho era verificado. Suas mudanças foram preservadas; tente recuperar novamente quando terminar de editar.",
        );
        return false;
      }
      // Keep the real base revision: relabeling an old draft as current silently overwrites a conflict after reload.
      if (candidate.revision !== revision.current) {
        blocked.current = true;
        setConflict(true);
      }
      revision.current = candidate.revision;
      restored.current = candidate;
      // Keep this editor's previous unsaved snapshot too; recovery starts a fresh writer.
      storage.current = new LabDraftStorage(
        localStorage,
        initial,
        crypto.randomUUID(),
        () => !sessionEnded.current,
      );
      update(candidate.document);
      setRecoveries((current) =>
        current.filter((entry) => entry.key !== recovery.key || entry.raw !== recovery.raw),
      );
      if (blocked.current)
        setStatus(
          "O rascunho e a conta têm versões diferentes. Preserve suas mudanças em uma cópia.",
        );
      return true;
    } catch (error) {
      if (mounted.current)
        setStatus(
          error instanceof Error
            ? `${error.message} A montagem atual e o rascunho original foram preservados.`
            : "Não foi possível recuperar. A montagem atual e o rascunho original foram preservados.",
        );
      try {
        await refreshRecoveries();
      } catch {
        if (mounted.current)
          setStatus(
            "Não foi possível atualizar a lista de rascunhos. A montagem atual e todos os rascunhos continuam preservados; recarregue para tentar novamente.",
          );
      }
      return false;
    } finally {
      recoveryInFlight.current = false;
      if (mounted.current) setRecovering(false);
    }
  }
  async function discardRecovery() {
    if (!recovery || recoveryInFlight.current) return;
    recoveryInFlight.current = true;
    setRecovering(true);
    try {
      await getStorage().acknowledge(recovery);
      if (mounted.current)
        setRecoveries((current) =>
          current.filter((entry) => entry.key !== recovery.key || entry.raw !== recovery.raw),
        );
    } catch {
      if (mounted.current)
        setStatus("Não foi possível registrar sua escolha. O rascunho continua preservado.");
    } finally {
      recoveryInFlight.current = false;
      if (mounted.current) setRecovering(false);
    }
  }
  return {
    document,
    update,
    flush,
    status,
    dirty,
    conflict,
    recovery,
    restore,
    discardRecovery,
    recovering,
    recoveryCount: recoveries.length,
    refreshRecoveries,
    getRevision: () => revision.current,
    getSavedVersion: () => ({ revision: revision.current, updatedAt: updatedAt.current }),
    confirmAssessmentDate: (date: string) => {
      updatedAt.current = date;
    },
  };
}
