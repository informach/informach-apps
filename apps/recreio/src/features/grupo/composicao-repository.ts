import "server-only";
import { and, eq, inArray } from "@informach/db";
import {
  recreioGroups as groups,
  recreioGuardianLinks as guardians,
  recreioProfiles as profiles,
  users,
} from "@informach/db/schema";
import { type ContaId, ContaIdSchema, type GrupoId } from "@informach/recreio";
import { serializarContaNativa } from "@/features/account/serializacao-repository";
import { AppError, assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";

export class ComposicaoDoGrupoMudou extends AppError {
  constructor() {
    super("CONFLITO", "O grupo mudou. Reabra a gestão antes de continuar.");
  }
}

export async function pistasDaComposicao(tx: Transacao, grupoId: GrupoId) {
  const pistas = await tx
    .select({
      perfilId: profiles.id,
      contaId: profiles.userId,
      responsavelId: guardians.guardianUserId,
    })
    .from(profiles)
    .leftJoin(guardians, eq(guardians.profileId, profiles.id))
    .where(eq(profiles.groupId, grupoId))
    .orderBy(profiles.id)
    .limit(5);
  assertAllowed(pistas.length <= 4, "GRUPO", "Confira a composição do grupo com o suporte.");
  return pistas;
}

/** Autoridade técnica limitada à conciliação de fatos já admitidos. Não cria
 * sessão do pagante nem concede gestão familiar; o chamador conserva o ciclo
 * financeiro e comprova o pagante/grupo da fila. Mesma ordem da composição nativa.
 */
export async function admitirGrupoDaConciliacao(
  tx: Transacao,
  paganteId: ContaId,
  grupoId: GrupoId,
) {
  const [pista] = await tx
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.id, grupoId), eq(groups.ownerUserId, paganteId)));
  assertAllowed(pista, "COBRANCA", "Grupo financeiro não disponível.");
  const pistas = await pistasDaComposicao(tx, grupoId);
  const contas = [
    ...new Set([
      paganteId,
      ...pistas.flatMap((p) => [p.contaId, p.responsavelId].filter((id) => id !== null)),
    ]),
  ].sort();
  for (const conta of contas) await serializarContaNativa(tx, ContaIdSchema.parse(conta));
  if (JSON.stringify(pistas) !== JSON.stringify(await pistasDaComposicao(tx, grupoId)))
    throw new ComposicaoDoGrupoMudou();
  await tx
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.id, contas))
    .orderBy(users.id)
    .for("share");
  const [grupo] = await tx
    .select({ id: groups.id, ownerUserId: groups.ownerUserId })
    .from(groups)
    .where(and(eq(groups.id, grupoId), eq(groups.ownerUserId, paganteId)))
    .for("update");
  assertAllowed(grupo, "COBRANCA", "Grupo financeiro não disponível.");
  const perfis = await tx
    .select()
    .from(profiles)
    .where(eq(profiles.groupId, grupo.id))
    .orderBy(profiles.id)
    .for("update");
  if (JSON.stringify(pistas) !== JSON.stringify(await pistasDaComposicao(tx, grupoId)))
    throw new ComposicaoDoGrupoMudou();
  return { grupo, perfis };
}
