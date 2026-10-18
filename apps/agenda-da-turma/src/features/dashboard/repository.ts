import "server-only";

import { db, sql } from "@informach/db";
import { agendaStudentProfiles, agendaTasks } from "@informach/db/schema";
import { accessibleProfileCondition } from "@/features/family/access";
import { APP_TIME_ZONE, addDaysIso, todayLocalIso } from "./date";
import { STREAK_LOOKBACK_DAYS } from "./streak";

/**
 * Os dias em que a família concluiu alguma coisa, para a sequência.
 *
 * Devolve DIAS, não linhas: a sequência não se importa com quantas atividades
 * cada dia teve, e agregar no banco evita trazer meses de tarefas para contar
 * datas em JavaScript.
 *
 * Sem `profileFilter` de propósito: a sequência é da casa (ver `streak.ts`).
 * O recorte por criança que o resto da rotina aceita transformaria o número num
 * placar entre irmãos, que é justamente o que a regra do app proíbe.
 */
export async function listFamilyCompletionDays(userId: string): Promise<string[]> {
  const sinceIso = addDaysIso(todayLocalIso(), -STREAK_LOOKBACK_DAYS);
  const rows = await db.execute<{ day: string }>(sql`
    SELECT DISTINCT
      -- to_char e nao ::date::text: a segunda forma depende do DateStyle
      -- da sessao, que nada no projeto fixa, e countStreakDays compara
      -- strings "YYYY-MM-DD".
      to_char(${agendaTasks.completedAt} AT TIME ZONE ${APP_TIME_ZONE}, 'YYYY-MM-DD') AS day
    FROM ${agendaTasks}
    INNER JOIN ${agendaStudentProfiles} ON ${agendaStudentProfiles.id} = ${agendaTasks.profileId}
    WHERE ${accessibleProfileCondition(userId)}
      AND ${agendaTasks.status} = 'done'
      -- Comparacao sobre a coluna crua, e nao sobre uma expressao dela: com a
      -- conversao do lado esquerdo o predicado nao e sargavel e nenhum indice
      -- em completed_at poderia ajudar. A data local vira o instante da
      -- meia-noite em Sao Paulo, do lado direito.
      AND ${agendaTasks.completedAt} >= ${sinceIso}::date AT TIME ZONE ${APP_TIME_ZONE}
  `);
  return rows.map((row) => row.day);
}
