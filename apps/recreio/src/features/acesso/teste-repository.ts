import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, eq, inArray, isNull } from "@informach/db";
import {
  recreioTrialClaims as claims,
  customers,
  recreioGameSessions as games,
  recreioEntitlements as grants,
} from "@informach/db/schema";
import { type GrupoId, GrupoIdSchema, PerfilIdSchema } from "@informach/recreio";
import type { admitirGrupoDoTitular } from "@/features/grupo/autoridade-repository";
import { encerrarSessoesAbertas } from "@/features/sessao-de-jogo/encerramento-repository";
import { invalidarIngressosDoPerfil } from "@/features/sessao-de-jogo/ingressos-repository";
import type { Transacao } from "@/lib/repository";
import { decidirFatosLidos } from "./decisao";
import { lerFatosDoGrupo } from "./repository";

/** Histórico local suficiente para recusar um teste novo; não prova ausência de
 * cobrança remota se um cliente comercial já foi preparado. Checkout admitido
 * e primeiro teste precisam tomar o mesmo ciclo por pagante antes da TX.
 */
export async function elegivelParaTeste(tx: Transacao, grupoId: GrupoId | null, paganteId: string) {
  const [concessao, cliente, marca] = await Promise.all([
    grupoId === null
      ? Promise.resolve([])
      : tx.select({ id: grants.id }).from(grants).where(eq(grants.groupId, grupoId)).limit(1),
    tx
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.app, "recreio"),
          eq(customers.provider, "stripe"),
          eq(customers.subjectType, "user"),
          eq(customers.subjectId, paganteId),
        ),
      )
      .limit(1),
    tx
      .select({ id: claims.payerUserId })
      .from(claims)
      .where(eq(claims.payerUserId, paganteId))
      .limit(1),
  ]);
  return concessao.length === 0 && cliente.length === 0 && marca.length === 0;
}

export async function revogarTesteDoConsentimento(
  tx: Transacao,
  grupoId: GrupoId,
  paganteId: string,
  consentimentoId: string,
  agora: Date,
) {
  const [marca] = await tx
    .select()
    .from(claims)
    .where(
      and(
        eq(claims.groupId, grupoId),
        eq(claims.payerUserId, paganteId),
        eq(claims.enrollmentId, consentimentoId),
      ),
    );
  if (!marca) return false;
  const [revogada] = await tx
    .update(grants)
    .set({
      revokedAt: agora,
      revokedByUserId: paganteId,
      revokeReasonCode: "consentimento_retirado",
    })
    .where(
      and(
        eq(grants.id, marca.entitlementId),
        eq(grants.groupId, grupoId),
        eq(grants.kind, "trial"),
        eq(grants.tier, "family"),
        eq(grants.startsAt, marca.startsAt),
        eq(grants.endsAt, marca.endsAt),
        isNull(grants.revokedAt),
      ),
    )
    .returning({ id: grants.id });
  if (revogada)
    await logAuditEventStrict(
      "recreio.entitlement_revoked",
      paganteId,
      {
        app: "recreio",
        groupId: grupoId,
        targetId: paganteId,
        entitlementId: revogada.id,
        reasonCode: "consentimento_retirado",
      },
      { writer: tx },
    );
  return Boolean(revogada);
}

/** Chamador já admitiu/travou o grupo e seus perfis. Um fallback ainda válido
 * pode ter prazo menor que a JWT antiga; nesse caso a SID também termina,
 * para exigir outra credencial limitada, em vez de conservar a JWT longa.
 */
export async function revalidarSessoesDoGrupo(
  tx: Transacao,
  atual: Awaited<ReturnType<typeof admitirGrupoDoTitular>>,
  agora: Date,
) {
  const grupoId = GrupoIdSchema.parse(atual.grupo.id);
  const fatos = await lerFatosDoGrupo(grupoId, tx);
  if (!fatos || atual.perfis.length === 0) return;
  const abertas = await tx
    .select({ profileId: games.profileId, expiresAt: games.expiresAt })
    .from(games)
    .where(
      and(
        inArray(
          games.profileId,
          atual.perfis.map((p) => p.id),
        ),
        isNull(games.endedAt),
      ),
    );
  const semAcesso: string[] = [],
    prazoMenor: string[] = [];
  for (const perfil of atual.perfis) {
    const decisao = decidirFatosLidos(
      {
        perfil: {
          id: PerfilIdSchema.parse(perfil.id),
          status: perfil.status,
          coberturaLigada: perfil.coverageEnabled,
          versaoDaPolitica: perfil.policyVersion,
        },
        grupo: fatos,
      },
      agora,
    );
    const prazo = decisao.validoAte;
    if (!decisao.podeJogar) semAcesso.push(perfil.id);
    else if (
      prazo !== null &&
      abertas.some((s) => s.profileId === perfil.id && s.expiresAt > prazo)
    )
      prazoMenor.push(perfil.id);
  }
  for (const id of [...semAcesso, ...prazoMenor])
    await invalidarIngressosDoPerfil(tx, PerfilIdSchema.parse(id));
  if (semAcesso.length)
    await encerrarSessoesAbertas(tx, inArray(games.profileId, semAcesso), "access_lost", {
      porQuem: "recreio",
    });
  if (prazoMenor.length)
    await encerrarSessoesAbertas(tx, inArray(games.profileId, prazoMenor), "permissions_changed", {
      porQuem: "recreio",
    });
}
