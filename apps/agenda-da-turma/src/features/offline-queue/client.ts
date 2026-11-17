"use client";

import { z } from "zod";
import type { AgendaAuthority } from "@/features/family/authority";

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
  actor: AgendaAuthority;
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
      body: JSON.stringify({ ...entry.actor, version: entry.version, status: entry.status }),
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
  actor: AgendaAuthority | null;
}): Promise<ToggleResult> {
  if (!input.actor) return { ok: false, error: { code: "ACCOUNT_CHANGED" } };
  const key = crypto.randomUUID();
  const outcome = await post({
    key,
    taskId: input.id,
    version: input.version,
    status: input.status,
    fromQueue: false,
    actor: input.actor,
  });
  if (outcome.kind === "settled") {
    // Subiu de verdade: o que estava esperando OU marcado como recusado para
    // esta atividade deixa de valer. Sem isto, insistir num conflito pela
    // lixeira do card salvava a atividade e deixava a linha antiga na folha,
    // com a barra avisando para sempre sobre algo já resolvido.
    if (outcome.ok) await forgetTaskWrites(input.actor, input.id);
    return outcome.ok
      ? { ok: true, value: { id: input.id, version: outcome.version } }
      : { ok: false, error: { code: outcome.code } };
  }
  if (outcome.kind === "invalid") return { ok: false, error: { code: outcome.code } };

  const entry: PendingWrite = {
    key,
    taskId: input.id,
    ...input.actor,
    status: input.status,
    version: input.version,
    title: input.title,
    createdAt: Date.now(),
    state: "pending",
  };
  // Trocar de ideia ainda offline substitui a decisão anterior em vez de somar
  // uma segunda gravação com a mesma versão, que subiria já vencida.
  const mine = visibleForOwner(await listPendingWrites(), input.actor);
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
const inFlight = new Map<string, Promise<FlushResult>>();
export function flushPendingWrites(actor: AgendaAuthority): Promise<FlushResult> {
  const context = JSON.stringify([actor.userId, actor.familyGroupId]);
  const running = inFlight.get(context);
  if (running) return running;
  const promise = runFlush(actor).finally(() => {
    inFlight.delete(context);
  });
  inFlight.set(context, promise);
  return promise;
}

const legacyResolutionSchema = z
  .array(z.object({ taskId: z.uuid(), familyGroupId: z.uuid() }))
  .max(100);
async function resolveLegacyWrites(actor: AgendaAuthority) {
  const legacy = (await listPendingWrites()).filter(
    (entry) =>
      entry.userId === actor.userId &&
      entry.familyGroupId === null &&
      Date.now() - entry.createdAt < 7 * 86_400_000,
  );
  if (!legacy.length) return;
  // Bounded batches preserve all eligible decisions without sending activity titles.
  for (let offset = 0; offset < legacy.length; offset += 100) {
    const batch = legacy.slice(offset, offset + 100);
    try {
      const response = await fetch("/api/tasks/queue-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: actor.userId, taskIds: batch.map((entry) => entry.taskId) }),
      });
      if (!response.ok) return;
      const parsed = legacyResolutionSchema.safeParse(await response.json());
      if (!parsed.success) return;
      for (const entry of batch) {
        const context = parsed.data.find((row) => row.taskId === entry.taskId);
        if (context)
          await updatePendingWriteIfPresent({ ...entry, familyGroupId: context.familyGroupId });
      }
    } catch {
      return;
    }
  }
  notifyQueueChanged();
}
async function runFlush(actor: AgendaAuthority): Promise<FlushResult> {
  await resolveLegacyWrites(actor);
  const all = await listPendingWrites();
  // O que passou da validade sai antes de qualquer tentativa: subir uma decisão
  // de dez dias atrás com a versão daquele dia só produziria conflito.
  for (const stale of expiredKeys(all)) await deletePendingWrite(stale);
  let entries = visibleForOwner(all, actor);
  let sent = 0;
  let changed = false;
  for (const entry of orderedForFlush(entries)) {
    const outcome = await post({
      key: entry.key,
      taskId: entry.taskId,
      version: entry.version,
      status: entry.status,
      fromQueue: true,
      actor,
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

/** Tira da fila tudo que esta pessoa tinha guardado sobre uma atividade. */
async function forgetTaskWrites(actor: AgendaAuthority, taskId: string) {
  const mine = visibleForOwner(await listPendingWrites(), actor).filter(
    (entry) => entry.taskId === taskId,
  );
  if (!mine.length) return;
  for (const entry of mine) await deletePendingWrite(entry.key);
  notifyQueueChanged();
}

/** Descartar uma gravação que o servidor recusou. A decisão é de quem lê. */
export async function discardPendingWrite(actor: AgendaAuthority, key: string) {
  if (!visibleForOwner(await listPendingWrites(), actor).some((entry) => entry.key === key)) return;
  await deletePendingWrite(key);
  notifyQueueChanged();
}
