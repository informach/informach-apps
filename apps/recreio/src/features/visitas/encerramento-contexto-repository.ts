import "server-only";
import { and, eq } from "@informach/db";
import { recreioSpaceMembers as members } from "@informach/db/schema";
import { ErroDoRecreio } from "@informach/recreio";
import type { Transacao } from "@/lib/repository";
import { finalidadeDaSessao } from "./sessao-repository";

/**
 * Só checkpoint/saída: mundo e identidade já travados e SID conferido pelo
 * kernel. Uma admissão anterior pode congelar/salvar este SID mesmo após
 * perder a visita. Nunca autoriza comandos, entrada, renovação ou outro SID.
 */
export async function conferirParticipacaoParaEncerramento(
  tx: Transacao,
  pedido: { mundoId: string; perfilId: string; sid: string },
) {
  const visita = await finalidadeDaSessao(tx, pedido.sid);
  if (visita) {
    if (
      visita.profileId !== pedido.perfilId ||
      visita.spaceId !== pedido.mundoId ||
      visita.admittedAt === null ||
      visita.permissionUntil === null ||
      visita.state === "prepared"
    )
      throw new ErroDoRecreio("SEM_PERMISSAO");
    return;
  }
  const [membro] = await tx
    .select({ estado: members.state })
    .from(members)
    .where(and(eq(members.spaceId, pedido.mundoId), eq(members.profileId, pedido.perfilId)));
  if (membro?.estado !== "active") throw new ErroDoRecreio("SEM_PERMISSAO");
}
