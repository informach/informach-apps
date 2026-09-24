"use client";

import {
  applyOutcome,
  classifyResponse,
  expiredKeys,
  orderedForFlush,
  type PendingWrite,
  type PendingWriteStatus,
  supersededKeys,
  visibleForOwner,
  type WriteOutcome,
} from "./queue";
import {
  deletePendingWrite,
  listPendingWrites,
  notifyQueueChanged,
  savePendingWrite,
  updatePendingWriteIfPresent,
} from "./store";

export type ToggleResult = { ok: true; value: unknown } | { ok: false; error: { code: string } };

/** A marca que a UI otimista procura para dizer "sobe quando a rede voltar". */
export type QueuedValue = { queued: true; key: string };

export function isQueued(value: unknown): value is QueuedValue {
  return typeof value === "object" && value !== null && "queued" in value;
}

async function post(entry: {
  key: string;
  taskId: string;
  version: number;
  status: PendingWriteStatus;
  fromQueue: boolean;
}): Promise<WriteOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/tasks/${entry.taskId}/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": entry.key,
        ...(entry.fromQueue ? { "X-Agenda-Queued": "1" } : {}),
      },
      body: JSON.stringify({ version: entry.version, status: entry.status }),
    });
  } catch {
    // Sem rede, DNS preso, portal cativo: nada chegou ao servidor.
    return { kind: "retry" };
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Um redirecionamento para o login devolve HTML com 200. Corpo ilegível
    // nunca é sucesso.
    body = null;
  }
  return classifyResponse(response.status, body);
}

/**
 * O toque da pessoa.
 *
 * A chave nasce aqui, **antes** da primeira tentativa, e é a mesma em toda
 * retentativa: é ela que garante que a conclusão aconteça uma vez, e não uma
 * por tentativa. Quando o servidor não responde, a gravação é enfileirada e a
 * função devolve sucesso com a marca `queued` — a tela continua otimista, mas
 * passa a dizer que aquilo ainda não subiu.
 */
export async function submitTaskStatus(input: {
  id: string;
  version: number;
  status: PendingWriteStatus;
  title: string;
  /**
   * Quem está decidindo. A fila é da origem, não da sessão (ver `store.ts`).
   *
   * `null` quando a tela não está dentro de um `QueueOwnerProvider` — aí não há
   * fila, e a falha volta a ser falha. Guardar sem dono seria guardar para
   * qualquer um que entrasse depois neste aparelho.
   */
  userId: string | null;
}): Promise<ToggleResult> {
  const key = crypto.randomUUID();
  const outcome = await post({
    key,
    taskId: input.id,
    version: input.version,
    status: input.status,
    fromQueue: false,
  });
  if (outcome.kind === "settled")
    return outcome.ok
      ? { ok: true, value: { id: input.id } }
      : { ok: false, error: { code: outcome.code } };
  if (outcome.kind === "invalid") return { ok: false, error: { code: outcome.code } };
  if (!input.userId) return { ok: false, error: { code: "OFFLINE" } };

  const entry: PendingWrite = {
    key,
    taskId: input.id,
    userId: input.userId,
    status: input.status,
    version: input.version,
    title: input.title,
    createdAt: Date.now(),
    state: "pending",
  };
  // Trocar de ideia ainda offline substitui a decisão anterior em vez de somar
  // uma segunda gravação com a mesma versão, que subiria já vencida.
  const mine = visibleForOwner(await listPendingWrites(), input.userId);
  for (const stale of supersededKeys(mine, input.id)) await deletePendingWrite(stale);
  const stored = await savePendingWrite(entry);
  // Sem armazém não há fila, e prometer que "sobe quando a rede voltar" seria
  // mentira. Nesse caso a falha volta a ser falha, como era antes.
  if (!stored) return { ok: false, error: { code: "OFFLINE" } };
  notifyQueueChanged();
  void requestBackgroundSync();
  return { ok: true, value: { queued: true, key } satisfies QueuedValue };
}

/**
 * Pede ao navegador para avisar quando a rede voltar.
 *
 * É um reforço, nunca o caminho principal: o Background Sync não existe no
 * Safari, e onde existe pode ser negado por permissão. Quem garante o
 * esvaziamento continua sendo o `OfflineQueueFlusher`, na abertura do app e no
 * evento `online`.
 */
async function requestBackgroundSync() {
  try {
    const registration = await navigator.serviceWorker?.ready;
    const sync = (registration as { sync?: { register(tag: string): Promise<void> } } | undefined)
      ?.sync;
    await sync?.register("agenda-flush");
  } catch {
    /* Sem Background Sync a fila sobe pelos gatilhos da janela. */
  }
}

export type FlushResult = { sent: number; conflicts: number };

/**
 * Um esvaziamento de cada vez.
 *
 * A rede voltar dispara `online` e `visibilitychange` quase juntos, e o recado
 * do service worker pode chegar no mesmo instante. Sem esta trava seriam três
 * esvaziamentos simultâneos gastando o limite de frequência com as mesmas
 * gravações — e, pior, um deles regravaria do seu retrato em memória uma
 * entrada que outro tinha acabado de resolver.
 */
let inFlight: Promise<FlushResult> | null = null;

export function flushPendingWrites(userId: string): Promise<FlushResult> {
  inFlight ??= runFlush(userId).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runFlush(userId: string): Promise<FlushResult> {
  const all = await listPendingWrites();
  // O que passou da validade sai antes de qualquer tentativa: subir uma decisão
  // de dez dias atrás com a versão daquele dia só produziria conflito.
  for (const stale of expiredKeys(all)) await deletePendingWrite(stale);
  let entries = visibleForOwner(all, userId);
  let sent = 0;
  let changed = false;
  for (const entry of orderedForFlush(entries)) {
    const outcome = await post({
      key: entry.key,
      taskId: entry.taskId,
      version: entry.version,
      status: entry.status,
      fromQueue: true,
    });
    // A rede caiu de novo no meio: o resto continua esperando, e insistir só
    // gastaria bateria repetindo a mesma falha.
    if (outcome.kind === "retry") break;
    entries = applyOutcome(entries, entry.key, outcome);
    changed = true;
    if (outcome.kind === "settled" && outcome.ok) {
      await deletePendingWrite(entry.key);
      sent += 1;
    } else {
      const marked = entries.find((item) => item.key === entry.key);
      // `IfPresent`: a pessoa pode ter descartado esta entrada na folha
      // enquanto a resposta estava no ar, e recriá-la seria desfazer o descarte.
      if (marked) await updatePendingWriteIfPresent(marked);
    }
  }
  if (changed) notifyQueueChanged();
  return { sent, conflicts: entries.filter((entry) => entry.state === "conflict").length };
}

/** Descartar uma gravação que o servidor recusou. A decisão é de quem lê. */
export async function discardPendingWrite(key: string) {
  await deletePendingWrite(key);
  notifyQueueChanged();
}
