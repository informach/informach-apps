import "server-only";
import { and, eq, inArray, sql } from "@informach/db";
import { recreioSpaceMembers as members, recreioSpaces as spaces } from "@informach/db/schema";
import { type MundoId, MundoIdSchema, type PerfilId } from "@informach/recreio";
import type { Transacao } from "@/lib/repository";

/** Pista sem autoridade. A conta já foi serializada; o mundo precede as travas dos perfis. */
export async function travarMundoCompartilhado(tx: Transacao, a: PerfilId, b: PerfilId) {
  const [pista] = await tx.execute<{ id: string }>(sql`
    select mundo.id from recreio.spaces mundo
    join recreio.space_members origem on origem.space_id=mundo.id
    join recreio.space_members destino on destino.space_id=mundo.id
    where origem.profile_id=${a} and destino.profile_id=${b}
      and origem.state='active' and destino.state='active'
      and mundo.status in ('active','hibernating','archived')
    order by mundo.id limit 1
  `);
  if (!pista) return null;
  const [mundo] = await tx
    .select({ id: spaces.id, estado: spaces.status })
    .from(spaces)
    .where(eq(spaces.id, pista.id))
    .for("share");
  return mundo && ["active", "hibernating", "archived"].includes(mundo.estado)
    ? MundoIdSchema.parse(mundo.id)
    : null;
}

/** Chamado somente depois das travas dos dois perfis. Nunca cria uma participação. */
export async function confirmarCoparticipacao(
  tx: Transacao,
  mundoId: MundoId | null,
  a: PerfilId,
  b: PerfilId,
) {
  if (!mundoId || a === b) return null;
  const atuais = await tx
    .select({ perfilId: members.profileId })
    .from(members)
    .where(
      and(
        eq(members.spaceId, mundoId),
        inArray(members.profileId, [a, b]),
        eq(members.state, "active"),
      ),
    );
  return atuais.length === 2 ? mundoId : null;
}
