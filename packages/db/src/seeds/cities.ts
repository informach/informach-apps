import { sql } from "drizzle-orm";
import type { Database } from "../client";
import { agendaCities, agendaStates } from "../schema";

type IbgeCity = {
  id: number;
  nome: string;
};

export async function seedCities(db: Database): Promise<void> {
  const states = await db.select({ uf: agendaStates.uf }).from(agendaStates);
  if (states.length === 0) {
    throw new Error("[seeds:cities] no states found — run seedStates first");
  }

  let total = 0;
  for (const { uf } of states) {
    const response = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`,
    );
    if (!response.ok) {
      throw new Error(`IBGE municipios for ${uf} failed: ${response.status}`);
    }
    const cities = (await response.json()) as IbgeCity[];
    if (!Array.isArray(cities) || cities.length === 0) continue;

    const rows = cities.map((c) => ({
      ibgeCode: String(c.id),
      stateUf: uf,
      name: c.nome,
    }));

    // Insert in batches to keep statements small.
    const batchSize = 500;
    for (let i = 0; i < rows.length; i += batchSize) {
      const slice = rows.slice(i, i + batchSize);
      await db
        .insert(agendaCities)
        .values(slice)
        .onConflictDoUpdate({
          target: agendaCities.ibgeCode,
          set: {
            stateUf: sql`excluded.state_uf`,
            name: sql`excluded.name`,
          },
        });
    }
    total += rows.length;
    console.log(`[seeds:cities] ${uf}: upserted ${rows.length}`);
  }
  console.log(`[seeds:cities] upserted ${total} cities from IBGE`);
}
