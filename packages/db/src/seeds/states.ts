import { sql } from "drizzle-orm";
import type { Database } from "../client";
import { agendaStates } from "../schema";

type IbgeState = {
  id: number;
  sigla: string;
  nome: string;
};

export async function seedStates(db: Database): Promise<void> {
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
