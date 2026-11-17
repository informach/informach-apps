import "server-only";
import { and, eq } from "@informach/db";
import { recreioSpaceMembers as members, recreioSpaces as spaces } from "@informach/db/schema";
import type { PerfilId } from "@informach/recreio";
import type { Transacao } from "@/lib/repository";

/**
 * Leitores e gestores antigos também tomam o mundo antes de perfil/aparelho.
 * Isto só ordena travas: a participação e a autoridade continuam sendo
 * relidas pelo chamador. Um ID alheio não permite travar o mundo de outra pessoa.
 */
export async function travarMundoAntesDosPerfis(
  tx: Transacao,
  perfilId: PerfilId,
  mundoId: string,
  modo: "share" | "update",
) {
  const [pista] = await tx
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.spaceId, mundoId), eq(members.profileId, perfilId)));
  if (!pista) return;
  await tx.select({ id: spaces.id }).from(spaces).where(eq(spaces.id, mundoId)).for(modo);
}
