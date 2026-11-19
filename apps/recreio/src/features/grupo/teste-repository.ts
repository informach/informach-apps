import "server-only";
import { and, db, eq, inArray } from "@informach/db";
import { recreioGroups as groups, recreioProfiles as profiles, users } from "@informach/db/schema";
import { ContaIdSchema, ErroDoRecreio, GrupoIdSchema } from "@informach/recreio";
import { serializarContaNativa } from "@/features/account/autoridade-repository";
import type { ReferenciaDeJogador } from "@/features/autoridade-de-jogo/aparelho-repository";
import type { Transacao } from "@/lib/repository";

/** Descoberta anterior ao mutex financeiro; nunca autoriza pelo resultado. */
export async function pistaDoGrupoDoTeste(referencia: ReferenciaDeJogador) {
  const [pista] = await db
    .select({ grupoId: groups.id, paganteId: groups.ownerUserId })
    .from(profiles)
    .innerJoin(groups, eq(groups.id, profiles.groupId))
    .where(eq(profiles.id, referencia.perfilId));
  return pista ? { grupoId: GrupoIdSchema.parse(pista.grupoId), paganteId: pista.paganteId } : null;
}

export type PistaDoGrupoDoTeste = NonNullable<Awaited<ReturnType<typeof pistaDoGrupoDoTeste>>>;

/** Apenas prepara contas → grupo. O kernel autentica perfil/aparelho depois.
 * O jogador conserva a própria identidade, inclusive quando pagante e responsável
 * são adultos diferentes. Não fabrica uma sessão nativa do pagante.
 */
export async function travarGrupoDoTeste(
  tx: Transacao,
  referencia: ReferenciaDeJogador,
  pista: PistaDoGrupoDoTeste,
  contaDoAparelho: string,
) {
  const contas = [...new Set([contaDoAparelho, pista.paganteId])].sort();
  for (const id of contas) await serializarContaNativa(tx, ContaIdSchema.parse(id));
  const atuais = await tx
    .select()
    .from(users)
    .where(inArray(users.id, contas))
    .orderBy(users.id)
    .for("share");
  if (atuais.length !== contas.length) throw new ErroDoRecreio("SESSAO_INVALIDA");
  const [grupo] = await tx
    .select({ id: groups.id, ownerUserId: groups.ownerUserId })
    .from(groups)
    .where(and(eq(groups.id, pista.grupoId), eq(groups.ownerUserId, pista.paganteId)))
    .for("update");
  const [perfil] = await tx
    .select({ grupoId: profiles.groupId })
    .from(profiles)
    .where(eq(profiles.id, referencia.perfilId));
  if (!grupo || perfil?.grupoId !== grupo.id) throw new ErroDoRecreio("SESSAO_INVALIDA");
  const pagante = atuais.find((c) => c.id === pista.paganteId);
  if (!pagante) throw new ErroDoRecreio("SESSAO_INVALIDA");
  return pagante;
}
