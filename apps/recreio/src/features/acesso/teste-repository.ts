import "server-only";
import { randomInt } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth";
import { and, eq, inArray, isNull } from "@informach/db";
import {
  recreioTrialClaims as claims,
  customers,
  recreioTrialEnrollments as enrollments,
  recreioGameSessions as games,
  recreioEntitlements as grants,
} from "@informach/db/schema";
import {
  ErroDoRecreio,
  type GrupoId,
  GrupoIdSchema,
  PerfilIdSchema,
  type SessaoDeJogoId,
} from "@informach/recreio";
import type { admitirGrupoDoTitular } from "@/features/grupo/autoridade-repository";
import { VERSAO_DA_DECLARACAO_ADULTA } from "@/features/grupo/convites-constantes";
import { encerrarSessoesAbertas } from "@/features/sessao-de-jogo/encerramento-repository";
import { invalidarIngressosDoPerfil } from "@/features/sessao-de-jogo/ingressos-repository";
import { DURACAO_DO_TESTE_MS, VERSAO_DO_TESTE } from "@/features/teste/constantes";
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

/** Sob o ciclo financeiro e a trava do grupo. Ainda não inicia o prazo. */
export async function consentimentoElegivelParaTeste(
  tx: Transacao,
  grupoId: GrupoId,
  paganteId: string,
  agora: Date,
) {
  if (!(await elegivelParaTeste(tx, grupoId, paganteId))) return null;
  const [linha] = await tx
    .select()
    .from(enrollments)
    .where(
      and(
        eq(enrollments.groupId, grupoId),
        eq(enrollments.payerUserId, paganteId),
        eq(enrollments.policyVersion, VERSAO_DO_TESTE),
        eq(enrollments.adultDeclarationVersion, VERSAO_DA_DECLARACAO_ADULTA),
        isNull(enrollments.withdrawnAt),
      ),
    )
    .for("share");
  return linha && linha.acceptedAt <= agora ? linha : null;
}

/** Só dentro do savepoint da primeira SID: qualquer recusa posterior reverte. */
export async function prepararConcessaoDoTeste(
  tx: Transacao,
  consentimento: typeof enrollments.$inferSelect,
  agora: Date,
) {
  const coorte = randomInt(2) === 0 ? "48h" : "7d";
  const fim = new Date(agora.getTime() + DURACAO_DO_TESTE_MS[coorte]);
  const [concessao] = await tx
    .insert(grants)
    .values({
      groupId: consentimento.groupId,
      kind: "trial",
      tier: "family",
      startsAt: agora,
      endsAt: fim,
      reasonCode: "trial_experiment",
    })
    .returning({ id: grants.id });
  if (!concessao) throw new ErroDoRecreio("INDISPONIVEL");
  return { id: concessao.id, coorte, inicio: agora, fim };
}

/** Chamado somente depois de comprovar a SID real, na mesma transação. */
export async function confirmarInicioDoTeste(
  tx: Transacao,
  consentimento: typeof enrollments.$inferSelect,
  concessao: Awaited<ReturnType<typeof prepararConcessaoDoTeste>>,
  origem: { contaId: string; perfilId: string; sid: SessaoDeJogoId },
) {
  await tx.insert(claims).values({
    payerUserId: consentimento.payerUserId,
    groupId: consentimento.groupId,
    enrollmentId: consentimento.id,
    entitlementId: concessao.id,
    cohort: concessao.coorte,
    policyVersion: consentimento.policyVersion,
    startsAt: concessao.inicio,
    endsAt: concessao.fim,
  });
  await logAuditEventStrict(
    "recreio.trial_started",
    origem.contaId,
    {
      app: "recreio",
      groupId: consentimento.groupId,
      enrollmentId: consentimento.id,
      entitlementId: concessao.id,
      profileId: origem.perfilId,
      sessionId: origem.sid,
      cohort: concessao.coorte,
      policyVersion: consentimento.policyVersion,
    },
    { writer: tx },
  );
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
