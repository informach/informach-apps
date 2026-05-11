import { count, sql } from "drizzle-orm";
import type { Database } from "../client";
import { agendaStates } from "../schema";

type IbgeState = {
  id: number;
  sigla: string;
  nome: string;
};

// 27 UFs (26 estados + DF). Short-circuit threshold conservador.
const EXPECTED_STATES_COUNT = 27;

export async function seedStates(db: Database): Promise<void> {
  // Curto-circuito: se a tabela já tem todos os UFs, pula o fetch externo
  // (defesa contra IBGE indisponível — todo deploy do migrator chama isso).
  const [existing] = await db.select({ value: count() }).from(agendaStates);
  if (existing && existing.value >= EXPECTED_STATES_COUNT) {
    console.log(`[seeds:states] skip — ${existing.value} UFs já populados`);
    return;
  }

  const response = await fetch("https://servicodados.ibge.gov.br/api/v1/localidades/estados");
  if (!response.ok) {
    throw new Error(`IBGE estados request failed: ${response.status}`);
  }
  const states = (await response.json()) as IbgeState[];
  if (!Array.isArray(states) || states.length === 0) {
    throw new Error("IBGE estados returned empty payload");
  }

  const rows = states.map((s) => ({
    uf: s.sigla,
    ibgeCode: String(s.id),
    name: s.nome,
  }));

  await db
    .insert(agendaStates)
    .values(rows)
    .onConflictDoUpdate({
      target: agendaStates.uf,
      set: {
        ibgeCode: sql`excluded.ibge_code`,
        name: sql`excluded.name`,
      },
    });

  console.log(`[seeds:states] upserted ${rows.length} states from IBGE`);
}
