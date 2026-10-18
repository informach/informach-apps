import "server-only";
import { sql } from "@informach/db";
import { agendaProfileSubjects, agendaTasks } from "@informach/db/schema";

/**
 * Matéria extracurricular pausada é silêncio — em todo lugar.
 *
 * A regra sempre esteve escrita no guia do app, mas só era aplicada em duas
 * consultas: os contadores da exportação em PDF e o card de progresso por
 * criança. A projeção unificada — que alimenta os quatro KPIs da rotina, os três
 * buckets e a lista de `/atividades` — não aplicava.
 *
 * Enquanto os números não abriam listas, a divergência passava despercebida.
 * Depois que os contadores viraram link ela ficou na cara: na mesma tela, o card
 * dizia "Atrasadas 1" e o progresso logo abaixo dizia 0 para a mesma criança, e
 * o card abria uma lista com o item.
 *
 * O predicado mora aqui porque é a feature que possui
 * `agenda.profile_subjects.status` quem define o que "pausada" significa.
 *
 * **Regra:** toda consulta sobre `agenda.tasks` que produza número, lista ou
 * mensagem sobre o que a família AINDA TEM A FAZER compõe este predicado. São
 * CINCO hoje: `activityIndexCte`, `countPendingActivities`, `listTasksInDateRange`,
 * `listNoticeActions` e `findLoadUntilExam`. Aplicar em algumas e não em outras é
 * pior que não aplicar: foi assim que o limite do plano gratuito passou a contar
 * o que a tela escondia, e foi assim que a carga do plano de estudo quase
 * repetiu o erro — um dia "cheio" de atividades de uma matéria pausada empurrava
 * a sessão para outro dia, sem nenhuma causa visível.
 *
 * **A exceção é histórico**, e é deliberada: `listFamilyCompletionDays`, que
 * alimenta a sequência da família, NÃO compõe. Ela conta dias em que a casa
 * cuidou de alguma coisa, e pausar uma matéria hoje não desfaz o que foi feito em
 * março. Silenciar o que está por fazer é respeitar a pausa; reescrever o que já
 * foi feito é outra coisa.
 *
 * Tarefa sem vínculo com matéria nunca é escondida por isto — a maioria delas.
 */
// `sql` e `sql.raw` devolvem o mesmo tipo; usar o do `raw` evita importar
// `SQL` do drizzle, que `@informach/db` não reexporta.
function condition(profileSubjectIdRef: ReturnType<typeof sql.raw>) {
  return sql`(
    ${profileSubjectIdRef} IS NULL
    OR EXISTS (
      SELECT 1 FROM ${agendaProfileSubjects} ps
      WHERE ps.id = ${profileSubjectIdRef} AND ps.status = 'active'
    )
  )`;
}

/** Para consultas do query builder, onde a tabela vem qualificada. */
export const activeProfileSubjectCondition = condition(sql`${agendaTasks.profileSubjectId}`);

/**
 * Para SQL cru que apelida `agenda.tasks`.
 *
 * `countPendingActivities` escreve a consulta à mão com o alias `n`, e a
 * referência qualificada acima não casaria com ele. O alias vem de código, nunca
 * de entrada de quem usa.
 */
export function activeProfileSubjectConditionFor(alias: string) {
  return condition(sql.raw(`"${alias}"."profile_subject_id"`));
}
