/**
 * A fila de gravações que ainda não subiram — a parte que não toca o navegador.
 *
 * Tudo aqui é função pura sobre uma lista: de quem é cada entrada, o que fazer
 * com a resposta do servidor, o que a barra deve dizer, quem ainda pode subir.
 * O IndexedDB e o `fetch` moram ao lado (`store.ts`, `client.ts`) para que a
 * decisão — a parte em que errar custa uma conclusão perdida — possa ser
 * testada sem navegador.
 */

/** Cancelar não entra na fila (ver `schemas.ts`): alcança a turma inteira. */
export type PendingWriteStatus = "pending" | "done";

export type PendingWrite = {
  /** A chave de idempotência. Nasce ANTES da primeira tentativa e nunca muda. */
  key: string;
  taskId: string;
  /**
   * Quem decidiu.
   *
   * O IndexedDB é da ORIGEM, não da sessão: sem esta coluna, uma gravação feita
   * antes do logout subiria com a sessão de quem entrasse depois, e o título da
   * atividade de uma família apareceria na folha de outra. O aparelho é
   * compartilhado — é a mesma razão pela qual o service worker nunca guarda
   * HTML autenticado.
   */
  userId: string;
  status: PendingWriteStatus;
  /** A versão que a pessoa via quando decidiu. É ela que o servidor confere. */
  version: number;
  /** Só para a tela: a fila precisa dizer QUAL atividade está esperando. */
  title: string;
  createdAt: number;
  state: "pending" | "conflict";
  /** O código com que o servidor recusou, quando recusou. */
  errorCode?: string;
};

/**
 * Depois disto, a entrada some.
 *
 * Casa com a retenção do recibo no servidor: passados sete dias a repetição
 * deixaria de ser repetição e viraria uma gravação nova com uma versão velha,
 * que só produziria conflito. É também o que impede um conflito abandonado de
 * manter "precisa de você" na tela para sempre.
 */
export const MAX_QUEUE_AGE_MS = 7 * 86_400_000;

/** O que é desta pessoa e ainda vale. Nada mais aparece nem sobe. */
export function visibleForOwner(
  entries: readonly PendingWrite[],
  userId: string,
  now = Date.now(),
): PendingWrite[] {
  return entries.filter(
    (entry) => entry.userId === userId && now - entry.createdAt < MAX_QUEUE_AGE_MS,
  );
}

/** O que já não vale para ninguém, e pode sair do aparelho. */
export function expiredKeys(entries: readonly PendingWrite[], now = Date.now()): string[] {
  return entries
    .filter((entry) => now - entry.createdAt >= MAX_QUEUE_AGE_MS)
    .map((entry) => entry.key);
}

/** O que fazer com o que o servidor respondeu. */
export type WriteOutcome =
  /** Resposta final do servidor, aceitando ou recusando. A entrada sai da fila. */
  | { kind: "settled"; ok: true; version?: number }
  | { kind: "settled"; ok: false; code: string }
  /** Transporte: sessão, sinal, limite, falha nossa. A entrada FICA. */
  | { kind: "retry" }
  /** O pedido está malformado e vai continuar malformado. A entrada vira conflito. */
  | { kind: "invalid"; code: string };

/** Status HTTP em que insistir nunca vai dar certo. */
const PERMANENT_STATUSES = new Set([400, 403, 404, 405, 413, 415]);

/**
 * Traduz a resposta HTTP em decisão.
 *
 * **O status é o contrato.** `200` com corpo legível é resultado de negócio e
 * encerra a entrada, mesmo quando é recusa. Transporte — 401 de sessão
 * expirada, 429, 5xx, rede caída — mantém a entrada na fila, e isso inclui o
 * `200` de um redirecionamento para o login, que chega como HTML: a gravação
 * tem de esperar a pessoa entrar de novo em vez de sumir achando que subiu.
 *
 * O grupo permanente é a exceção e precisa ser explícito. Um `403` de origem ou
 * um `404` de rota não melhoram com o tempo, e tratá-los como transporte
 * deixaria a entrada reenviando a cada `online`, a cada aba que volta a
 * aparecer, gastando o limite de frequência e mantendo na barra um "esperando a
 * rede" que nunca terminaria.
 */
export function classifyResponse(status: number, body: unknown): WriteOutcome {
  if (PERMANENT_STATUSES.has(status)) return { kind: "invalid", code: "INVALID_INPUT" };
  if (status !== 200) return { kind: "retry" };
  if (typeof body !== "object" || body === null) return { kind: "retry" };
  const receipt = body as { ok?: unknown; error?: { code?: unknown } };
  if (receipt.ok === true) {
    const version = (receipt as { value?: { version?: unknown } }).value?.version;
    return typeof version === "number"
      ? { kind: "settled", ok: true, version }
      : { kind: "settled", ok: true };
  }
  if (receipt.ok === false && typeof receipt.error?.code === "string")
    return { kind: "settled", ok: false, code: receipt.error.code };
  return { kind: "retry" };
}

/**
 * Aplica a decisão à fila.
 *
 * Aceito some. Recusado FICA, marcado como conflito: uma conclusão que o
 * servidor não quis é exatamente o que a pessoa precisa ver, e apagá-la em
 * silêncio devolveria o app ao problema que a fila veio resolver.
 */
export function applyOutcome(
  entries: readonly PendingWrite[],
  key: string,
  outcome: WriteOutcome,
): PendingWrite[] {
  switch (outcome.kind) {
    case "retry":
      return [...entries];
    case "invalid":
      return markConflict(entries, key, outcome.code);
    default:
      return outcome.ok
        ? entries.filter((entry) => entry.key !== key)
        : markConflict(entries, key, outcome.code);
  }
}

function markConflict(entries: readonly PendingWrite[], key: string, code: string): PendingWrite[] {
  return entries.map((entry) =>
    entry.key === key ? { ...entry, state: "conflict" as const, errorCode: code } : entry,
  );
}

/** Ordem de chegada. Duas decisões sobre a mesma atividade têm de subir na ordem. */
export function orderedForFlush(entries: readonly PendingWrite[]): PendingWrite[] {
  return entries.filter((e) => e.state === "pending").sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Enquanto a rede não volta, a última decisão sobre a mesma atividade vence.
 *
 * Marcar e desmarcar offline enfileirava duas gravações com a MESMA versão — a
 * segunda subia já vencida e virava conflito, pedindo atenção para uma
 * contradição que a pessoa já tinha resolvido sozinha ao tocar de novo. Sobe
 * uma só: a última.
 *
 * O que já foi recusado fica de fora e não é substituído: ali existe uma
 * decisão de outra pessoa esperando ser vista, e apagá-la seria justamente o
 * silêncio que esta fila veio evitar.
 */
export function supersededKeys(entries: readonly PendingWrite[], taskId: string): string[] {
  return entries
    .filter((entry) => entry.taskId === taskId && entry.state === "pending")
    .map((entry) => entry.key);
}

export type QueueSummary = { waiting: number; conflicts: number };

export function summarizeQueue(entries: readonly PendingWrite[]): QueueSummary {
  let waiting = 0;
  let conflicts = 0;
  for (const entry of entries) {
    if (entry.state === "conflict") conflicts += 1;
    else waiting += 1;
  }
  return { waiting, conflicts };
}

/**
 * O que a barra diz. Uma frase só, e ela precisa ser verdade.
 *
 * O que está em conflito **não** está esperando a rede: `orderedForFlush` não o
 * envia mais, e ele espera uma pessoa. Somar os dois num "N esperando a rede"
 * faria alguém guardar o telefone achando que tudo ia subir — o erro exato que
 * a barra existe para não cometer.
 *
 * O convite a tocar não entra aqui: no modo criança a barra é sobreposta e sem
 * ponteiro, e mandar tocar no que não responde é pior do que não convidar. Quem
 * decide isso é quem renderiza.
 */
export function queueMessage({ waiting, conflicts }: QueueSummary): string | null {
  if (waiting === 0 && conflicts === 0) return null;
  const waitingLine =
    waiting === 1 ? "1 mudança esperando a rede" : `${waiting} mudanças esperando a rede`;
  const conflictLine = conflicts === 1 ? "1 precisa de você" : `${conflicts} precisam de você`;
  if (conflicts === 0) return `${waitingLine}.`;
  if (waiting === 0)
    return conflicts === 1
      ? "1 mudança não pôde ser salva."
      : `${conflicts} mudanças não puderam ser salvas.`;
  return `${waitingLine}, ${conflictLine}.`;
}
