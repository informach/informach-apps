import "server-only";
import { logAuditEventStrict } from "@informach/auth/audit";
import { db, inArray, sql } from "@informach/db";
import {
  recreioProfiles as profiles,
  recreioSpaces as spaces,
  recreioProfileWorldTraces as traces,
} from "@informach/db/schema";
import { z } from "zod";

export class FalhaDaConciliacaoDeRastros extends Error {
  constructor(readonly codigo: "LIMITE" | "FONTE" | "RETIRADA_EM_CURSO") {
    super(`recreio.world_traces.${codigo}`);
  }
}

/** One-time, bounded legacy adoption. A session receives space_id only in the
 * authoritative admission transaction. This index is privacy discovery, never
 * membership, authorization or a statement that the person is still playing. */
export async function reconciliarRastrosLegados(entrada: "inspect" | "apply") {
  const modo = z.enum(["inspect", "apply"]).parse(entrada);
  return db.transaction(async (tx) => {
    if (modo === "inspect") await tx.execute(sql`set transaction read only`);
    await tx.execute(sql`select set_config('statement_timeout','5000ms',true),
      set_config('lock_timeout','2000ms',true),set_config('transaction_timeout','15000ms',true)`);
    const pares = await tx.execute<{
      profileId: string;
      spaceId: string;
      jogoConfere: boolean;
    }>(sql`
      select s.profile_id as "profileId",s.space_id as "spaceId",bool_and(s.game_id=w.game_id) as "jogoConfere"
      from recreio.game_sessions s join recreio.spaces w on w.id=s.space_id
      where not exists(select 1 from recreio.profile_world_traces t where t.profile_id=s.profile_id and t.space_id=s.space_id)
      group by s.profile_id,s.space_id order by s.profile_id,s.space_id limit 1001
    `);
    if (pares.length > 1000) throw new FalhaDaConciliacaoDeRastros("LIMITE");
    if (pares.some((p) => p.jogoConfere !== true)) throw new FalhaDaConciliacaoDeRastros("FONTE");
    if (modo === "inspect" || pares.length === 0) return { candidatos: pares.length, inseridos: 0 };
    const idsMundos = [...new Set(pares.map((p) => p.spaceId))].sort(),
      idsPerfis = [...new Set(pares.map((p) => p.profileId))].sort();
    // Same world-before-profile order as native admission/withdrawal. Reread
    // the profile barrier after waiting: never resurrect a withdrawn trace.
    const mundos = await tx
        .select({ id: spaces.id })
        .from(spaces)
        .where(inArray(spaces.id, idsMundos))
        .orderBy(spaces.id)
        .for("update"),
      perfis = await tx
        .select({ id: profiles.id, retirada: profiles.rightsOperationId })
        .from(profiles)
        .where(inArray(profiles.id, idsPerfis))
        .orderBy(profiles.id)
        .for("update");
    if (mundos.length !== idsMundos.length || perfis.length !== idsPerfis.length)
      throw new FalhaDaConciliacaoDeRastros("FONTE");
    if (perfis.some((p) => p.retirada !== null))
      throw new FalhaDaConciliacaoDeRastros("RETIRADA_EM_CURSO");
    const inseridos = await tx
      .insert(traces)
      .values(pares.map((p) => ({ profileId: p.profileId, spaceId: p.spaceId })))
      .onConflictDoNothing({ target: [traces.profileId, traces.spaceId] })
      .returning({ id: traces.profileId });
    if (inseridos.length)
      await logAuditEventStrict(
        "recreio.world_traces_reconciled",
        null,
        { app: "recreio", source: "game_sessions", count: inseridos.length },
        { writer: tx },
      );
    return { candidatos: pares.length, inseridos: inseridos.length };
  });
}
