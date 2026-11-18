import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, desc, eq, isNull, sql } from "@informach/db";
import {
  recreioTrialClaims as claims,
  recreioTrialEnrollments as enrollments,
  recreioGroups as groups,
} from "@informach/db/schema";
import { GrupoIdSchema } from "@informach/recreio";
import {
  type AutorNativoRecente,
  autorizarContaNativa,
  type IdentidadeNativa,
} from "@/features/account/autoridade-repository";
import {
  elegivelParaTeste,
  revalidarSessoesDoGrupo,
  revogarTesteDoConsentimento,
} from "@/features/acesso/teste-repository";
import { comCicloDeCobranca } from "@/features/cobranca/lifecycle";
import { admitirGrupoDoTitular } from "@/features/grupo/autoridade-repository";
import {
  GrupoCriadoDuranteEspera,
  prepararGrupoDoTitular,
} from "@/features/grupo/preparar-repository";
import { AppError, assertAllowed } from "@/lib/errors";
import { codigoDoPostgres, constraintDoPostgres, type Transacao } from "@/lib/repository";
import { VERSAO_DO_TESTE } from "./constantes";
import type { ConsentimentoDoTeste } from "./regras";

async function limites(tx: Transacao) {
  await tx.execute(sql`set local transaction_timeout='15s'`);
  await tx.execute(sql`set local statement_timeout='5s'`);
  await tx.execute(sql`set local lock_timeout='2s'`);
}

function recibo(linha: typeof enrollments.$inferSelect) {
  return {
    id: linha.id,
    aceitoEm: linha.acceptedAt.toISOString(),
    retiradoEm: linha.withdrawnAt?.toISOString() ?? null,
    versaoDoTeste: linha.policyVersion,
    versaoDaDeclaracao: linha.adultDeclarationVersion,
  };
}

export async function registrarConsentimentoNoBanco(
  autor: AutorNativoRecente,
  pedido: ConsentimentoDoTeste,
) {
  return comCicloDeCobranca(autor.contaId, async () => {
    for (const tentativa of [0, 1]) {
      try {
        return await db.transaction(async (tx) => {
          await limites(tx);
          const atual = await prepararGrupoDoTitular(tx, autor, "update");
          await atual.nativa.conferirPrazo(autor.login);
          const [existente] = await tx
            .select()
            .from(enrollments)
            .where(
              and(
                eq(enrollments.id, pedido.pedidoId),
                eq(enrollments.payerUserId, autor.contaId),
                eq(enrollments.groupId, atual.grupoId),
              ),
            )
            .for("update");
          if (existente) {
            assertAllowed(
              existente.payerUserId === autor.contaId &&
                existente.groupId === atual.grupoId &&
                existente.policyVersion === pedido.versaoDoTeste &&
                existente.adultDeclarationVersion === pedido.versaoDaDeclaracao,
              "TESTE",
              "Não foi possível confirmar esse pedido. Confira o recibo do seu teste.",
            );
            await atual.nativa.conferirPrazo(autor.login);
            return recibo(existente);
          }
          assertAllowed(
            await elegivelParaTeste(tx, atual.grupoId, autor.contaId),
            "TESTE",
            "Um novo teste não está disponível para esta conta. Seus perfis e progresso continuam guardados.",
          );
          const [ativo] = await tx
            .select()
            .from(enrollments)
            .where(and(eq(enrollments.payerUserId, autor.contaId), isNull(enrollments.withdrawnAt)))
            .for("update");
          if (ativo) {
            assertAllowed(
              ativo.policyVersion === VERSAO_DO_TESTE &&
                ativo.adultDeclarationVersion === pedido.versaoDaDeclaracao,
              "CONFLITO",
              "Confira ou retire o consentimento anterior antes de continuar.",
            );
            await atual.nativa.conferirPrazo(autor.login);
            return recibo(ativo);
          }
          const agora = await atual.nativa.conferirPrazo(autor.login);
          const [criado] = await tx
            .insert(enrollments)
            .values({
              id: pedido.pedidoId,
              payerUserId: autor.contaId,
              groupId: atual.grupoId,
              policyVersion: pedido.versaoDoTeste,
              adultDeclarationVersion: pedido.versaoDaDeclaracao,
              acceptedAt: agora,
            })
            .returning();
          assertAllowed(criado, "TESTE", "Não foi possível registrar o consentimento.");
          await logAuditEventStrict(
            "recreio.trial_enrollment_recorded",
            autor.contaId,
            {
              app: "recreio",
              groupId: atual.grupoId,
              enrollmentId: criado.id,
              policyVersion: pedido.versaoDoTeste,
              declarationVersion: pedido.versaoDaDeclaracao,
            },
            { writer: tx },
          );
          await atual.nativa.conferirPrazo(autor.login);
          return recibo(criado);
        });
      } catch (erro) {
        if (
          codigoDoPostgres(erro) === "23505" &&
          constraintDoPostgres(erro) === "trial_enrollments_pkey"
        )
          throw new AppError(
            "CONFLITO",
            "Não foi possível confirmar esse pedido. Reabra a página e confira seu recibo.",
          );
        if (!(erro instanceof GrupoCriadoDuranteEspera) || tentativa === 1) throw erro;
      }
    }
    throw new Error("recreio.trial.enrollment_not_resolved");
  });
}

export async function consultarMeuTesteNoBanco(autor: IdentidadeNativa) {
  const [pista] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.ownerUserId, autor.contaId));
  return db.transaction(async (tx) => {
    await limites(tx);
    if (!pista) {
      const nativa = await autorizarContaNativa(tx, autor);
      await nativa.conferirPrazo();
      const elegivel = await elegivelParaTeste(tx, null, autor.contaId);
      await nativa.conferirPrazo();
      return { consentimento: null, teste: null, elegivel };
    }
    const grupoId = GrupoIdSchema.parse(pista.id);
    const atual = await admitirGrupoDoTitular(tx, autor, grupoId, "share");
    const [consentimento] = await tx
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.payerUserId, autor.contaId), eq(enrollments.groupId, grupoId)))
      .orderBy(desc(enrollments.acceptedAt), desc(enrollments.id))
      .limit(1);
    const [teste] = await tx
      .select({ cohort: claims.cohort, startsAt: claims.startsAt, endsAt: claims.endsAt })
      .from(claims)
      .where(and(eq(claims.payerUserId, autor.contaId), eq(claims.groupId, grupoId)));
    const elegivel = await elegivelParaTeste(tx, grupoId, autor.contaId);
    await atual.nativa.conferirPrazo();
    return {
      consentimento: consentimento ? recibo(consentimento) : null,
      teste: teste
        ? {
            coorte: teste.cohort,
            inicio: teste.startsAt.toISOString(),
            fim: teste.endsAt.toISOString(),
          }
        : null,
      elegivel,
    };
  });
}

/** Reduz autoridade mesmo com o modo desligado, sem plano e sem login recente. */
export async function retirarConsentimentoNoBanco(autor: IdentidadeNativa, id: string) {
  return comCicloDeCobranca(autor.contaId, async () => {
    const [pista] = await db
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.ownerUserId, autor.contaId));
    assertAllowed(pista, "TESTE", "Consentimento não disponível.");
    const grupoId = GrupoIdSchema.parse(pista.id);
    return db.transaction(async (tx) => {
      await limites(tx);
      const atual = await admitirGrupoDoTitular(tx, autor, grupoId, "update");
      const [linha] = await tx
        .select()
        .from(enrollments)
        .where(
          and(
            eq(enrollments.id, id),
            eq(enrollments.groupId, grupoId),
            eq(enrollments.payerUserId, autor.contaId),
          ),
        )
        .for("update");
      assertAllowed(linha, "TESTE", "Consentimento não disponível.");
      if (linha.withdrawnAt !== null) {
        await atual.nativa.conferirPrazo();
        return recibo(linha);
      }
      const agora = await atual.nativa.conferirPrazo();
      await revogarTesteDoConsentimento(tx, grupoId, autor.contaId, id, agora);
      const [retirada] = await tx
        .update(enrollments)
        .set({ withdrawnAt: agora })
        .where(eq(enrollments.id, id))
        .returning();
      assertAllowed(retirada, "TESTE", "Não foi possível retirar o consentimento.");
      await logAuditEventStrict(
        "recreio.trial_enrollment_withdrawn",
        autor.contaId,
        {
          app: "recreio",
          groupId: grupoId,
          enrollmentId: id,
        },
        { writer: tx },
      );
      await revalidarSessoesDoGrupo(tx, atual, await atual.nativa.conferirPrazo());
      await atual.nativa.conferirPrazo();
      return recibo(retirada);
    });
  });
}
