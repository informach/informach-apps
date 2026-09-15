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
 * O predicado mora aqui, e não em nenhuma das duas, porque é a feature que
 * possui `agenda.profile_subjects.status` quem define o que "pausada" significa.
 * **Qualquer consulta nova sobre `agenda.tasks` que produza número ou lista para
 * a família deve compô-lo.**
 *
 * Tarefa sem vínculo com matéria nunca é escondida por isto — a maioria delas.
 */
export const activeProfileSubjectCondition = sql`(
  ${agendaTasks.profileSubjectId} IS NULL
  OR EXISTS (
    SELECT 1 FROM ${agendaProfileSubjects} ps
    WHERE ps.id = ${agendaTasks.profileSubjectId} AND ps.status = 'active'
  )
)`;
