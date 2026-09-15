import { randomUUID } from "node:crypto";
import type { NoticeActionInput } from "./schemas";

type Recurrence = NoticeActionInput["recurrence"];

/**
 * A qual série esta tarefa pertence depois de gravada.
 *
 * Regra única dos três caminhos de escrita (criar, corrigir por recado e
 * editar), porque os três já divergiram: a criação zerava a série quando a
 * repetição saía, e as duas edições preservavam o `seriesId` antigo. Uma tarefa
 * com repetição "nenhuma" carregando série é um registro que se contradiz —
 * o histórico de versões grava a série numa tarefa que não repete, e o índice
 * único `(series_id, profile_id, due_at)` passa a ter uma linha ocupando um
 * lugar que ninguém mais reivindica, até alguém remarcar o prazo em cima dela e
 * receber um erro de banco em vez de uma recusa com texto.
 *
 * Voltar a repetir depois de ter parado começa série NOVA, e é o certo: as
 * ocorrências futuras da série anterior já existem como linhas próprias, e
 * retomar o mesmo identificador as colocaria de volta na disputa pelo índice.
 * A família parou e recomeçou; o dado diz isso.
 */
export function resolveSeriesId(
  recurrence: Recurrence,
  previousSeriesId: string | null,
  newSeriesId: () => string = randomUUID,
): string | null {
  if (recurrence !== "weekly") return null;
  return previousSeriesId ?? newSeriesId();
}
