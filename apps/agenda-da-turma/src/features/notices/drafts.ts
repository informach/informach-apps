import type { DraftExtraction, NoticeExtraction, StoredExtraction } from "./schemas";

/**
 * Aritmética do rascunho guardado em `agenda.notices.parsed_result`.
 *
 * Sem `server-only`, como `trial-reserve.ts`: é transformação de JSON e precisa
 * ser testada sem banco. Quem lê e grava a linha é o repositório.
 */

/** Cada ação lida ganha um id estável antes de ser persistida. */
export function withActionIds(extraction: NoticeExtraction): StoredExtraction {
  return {
    ...extraction,
    actions: extraction.actions.map((action) => ({ ...action, id: crypto.randomUUID() })),
  };
}

/** Linhas anteriores aos ids ganham um ao serem lidas; só o que falta muda. */
export function ensureStoredActionIds(stored: StoredExtraction): {
  extraction: StoredExtraction;
  changed: boolean;
} {
  let changed = false;
  const actions = stored.actions.map((action) => {
    if (action.id) return action;
    changed = true;
    return { ...action, id: crypto.randomUUID() };
  });
  return { extraction: changed ? { ...stored, actions } : stored, changed };
}

/** O que a revisão mostra: as ações não descartadas, sem a marca. */
export function visibleDraftActions(stored: StoredExtraction): DraftExtraction {
  return {
    ...stored,
    actions: stored.actions
      .filter((action) => !action.discardedAt)
      .map(({ discardedAt: _discardedAt, ...action }) => action),
  };
}

/** Reimportar o mesmo conteúdo devolve a leitura inteira, já paga. */
export function restoreDiscardedActions(stored: StoredExtraction): {
  extraction: StoredExtraction;
  changed: boolean;
} {
  const changed = stored.actions.some((action) => Boolean(action.discardedAt));
  if (!changed) return { extraction: stored, changed };
  return {
    extraction: {
      ...stored,
      actions: stored.actions.map(({ discardedAt: _discardedAt, ...action }) => action),
    },
    changed,
  };
}
