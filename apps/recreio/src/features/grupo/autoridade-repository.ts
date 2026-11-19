import "server-only";
import { and, eq, inArray } from "@informach/db";
import {
  recreioGroups as groups,
  recreioGuardianLinks as guardians,
  recreioProfiles as profiles,
  users,
} from "@informach/db/schema";
import { type ContaId, ContaIdSchema, type GrupoId } from "@informach/recreio";
import {
  autorizarContaNativa,
  type FinalidadeDaContaNativa,
  type IdentidadeNativa,
  serializarContaNativa,
} from "@/features/account/autoridade-repository";
import { exigirParticipacaoAtivaLocked } from "@/features/account/participacao-repository";
import { AppError, assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";

export class ComposicaoDoGrupoMudou extends AppError {
  constructor() {
    super("CONFLITO", "O grupo mudou. Reabra a gestão antes de continuar.");
  }
}

async function pistasDaComposicao(tx: Transacao, grupoId: GrupoId) {
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

/**
 * Todos os mutexes nativos precedem contas/perfis, inclusive o próprio jogador
 * de um titular que esteja coberto por outro grupo. Evita a inversão em grupos
 * recíprocos. A pista não autoriza: composição e responsabilidade são relidas.
 */
async function admitirComposicao(
  tx: Transacao,
  autor: IdentidadeNativa,
  grupoId: GrupoId,
  modo: "share" | "update",
  autoridade: "titular" | "proprio" | "destinatario",
  finalidade: FinalidadeDaContaNativa = "participacao",
) {
  const [pistaDoGrupo] = await tx
    .select({ id: groups.id, titularId: groups.ownerUserId })
    .from(groups)
    .where(eq(groups.id, grupoId));
  assertAllowed(pistaDoGrupo, "GRUPO", "Grupo não disponível.");
  if (autoridade === "titular")
    assertAllowed(pistaDoGrupo.titularId === autor.contaId, "GRUPO", "Grupo não disponível.");
  else if (autoridade === "proprio") {
    const [proprio] = await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(
        and(
          eq(profiles.groupId, grupoId),
          eq(profiles.userId, autor.contaId),
          eq(profiles.kind, "adult"),
        ),
      );
    assertAllowed(proprio, "GRUPO", "Grupo não disponível.");
  }
  const pistas = await pistasDaComposicao(tx, grupoId);
  const contas = [
    ...new Set([
      autor.contaId,
      pistaDoGrupo.titularId,
      ...pistas.flatMap((p) => [p.contaId, p.responsavelId].filter((id) => id !== null)),
    ]),
  ].sort();
  for (const conta of contas) await serializarContaNativa(tx, ContaIdSchema.parse(conta));
  // Quem terminou enquanto esperávamos pode ter acrescentado outro mutex.
  // Soltar a transação antes de descobrir/tomar essa nova composição.
  if (JSON.stringify(pistas) !== JSON.stringify(await pistasDaComposicao(tx, grupoId)))
    throw new ComposicaoDoGrupoMudou();
  // Concessão/revogação da equipe trava a conta pagante antes dos perfis.
  const contasAtuais = await tx
    .select({
      id: users.id,
      emailVerified: users.emailVerified,
      banned: users.banned,
      banExpiresAt: users.banExpiresAt,
    })
    .from(users)
    .where(inArray(users.id, contas))
    .orderBy(users.id)
    .for("share");
  const nativa = await autorizarContaNativa(tx, autor, modo, "share", finalidade);
  const [grupo] = await tx
    .select({ id: groups.id, ownerUserId: groups.ownerUserId })
    .from(groups)
    .where(and(eq(groups.id, grupoId), eq(groups.ownerUserId, pistaDoGrupo.titularId)))
    .for(modo);
  assertAllowed(grupo, "GRUPO", "Grupo não disponível.");
  const perfis = await tx
    .select()
    .from(profiles)
    .where(eq(profiles.groupId, grupo.id))
    .orderBy(profiles.id)
    .for(modo);
  const vinculos =
    perfis.length > 0
      ? await tx
          .select({ perfilId: guardians.profileId, responsavelId: guardians.guardianUserId })
          .from(guardians)
          .where(
            inArray(
              guardians.profileId,
              perfis.map((p) => p.id),
            ),
          )
          .orderBy(guardians.profileId)
          .for("share")
      : [];
  if (JSON.stringify(pistas) !== JSON.stringify(await pistasDaComposicao(tx, grupoId)))
    throw new ComposicaoDoGrupoMudou();
  await nativa.conferirPrazo();
  if (autoridade === "proprio")
    assertAllowed(
      perfis.some((p) => p.userId === autor.contaId && p.kind === "adult"),
      "GRUPO",
      "Grupo não disponível.",
    );
  return {
    nativa,
    grupo,
    perfis,
    vinculos,
    titular: contasAtuais.find((c) => c.id === grupo.ownerUserId),
  };
}

export function admitirGrupoDoTitular(
  tx: Transacao,
  autor: IdentidadeNativa,
  grupoId: GrupoId,
  modo: "share" | "update",
  finalidade: "participacao" | "financeiro" = "participacao",
) {
  return admitirComposicao(tx, autor, grupoId, modo, "titular", finalidade);
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

/** Somente a participação comercial do próprio adulto; não concede gestão do grupo. */
export function admitirGrupoDaParticipacaoPropria(
  tx: Transacao,
  autor: IdentidadeNativa,
  grupoId: GrupoId,
) {
  return admitirComposicao(tx, autor, grupoId, "update", "proprio");
}

/** Só prepara as travas; destinatário ainda precisa comprovar seu convite no writer. */
export async function admitirGrupoParaAceite(
  tx: Transacao,
  autor: IdentidadeNativa,
  grupoId: GrupoId,
) {
  const atual = await admitirComposicao(tx, autor, grupoId, "update", "destinatario");
  await exigirParticipacaoAtivaLocked(tx, atual.grupo.ownerUserId);
  return atual;
}
