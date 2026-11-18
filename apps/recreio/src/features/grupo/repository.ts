import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioBillingContracts as contracts,
  recreioGameSessions as games,
  recreioGroups as groups,
  recreioProfiles as profiles,
} from "@informach/db/schema";
import { type GrupoId, GrupoIdSchema, PerfilIdSchema } from "@informach/recreio";
import {
  type AutorNativoRecente,
  autorizarContaNativa,
  type IdentidadeNativa,
} from "@/features/account/autoridade-repository";
import { decidirPlanoLido } from "@/features/acesso/decisao";
import { lerFatosDoGrupo, lerOrigemDaAssinaturaParaTroca } from "@/features/acesso/repository";
import { ofertasParaOAdulto } from "@/features/cobranca/regras";
import { encerrarSessoesAbertas } from "@/features/sessao-de-jogo/encerramento-repository";
import { invalidarIngressosDoPerfil } from "@/features/sessao-de-jogo/ingressos-repository";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { admitirGrupoDoTitular } from "./autoridade-repository";
import type { ConfirmacaoCoberturaDoGrupo } from "./regras";

async function lerRevisaoDaSelecao(
  tx: Transacao,
  grupoId: GrupoId,
  paganteId: string,
  trava: "share" | "update",
) {
  const pendentes = await tx
    .select()
    .from(contracts)
    .where(
      and(
        eq(contracts.groupId, grupoId),
        eq(contracts.payerUserId, paganteId),
        eq(contracts.providerMode, env.STRIPE_MODE),
        eq(contracts.coverageReviewRequired, true),
      ),
    )
    .limit(2)
    .for(trava);
  assertAllowed(pendentes.length <= 1, "CONFLITO", "A cobertura comercial exige conferência.");
  const contrato = pendentes[0];
  if (!contrato) return null;
  const oferta = ofertasParaOAdulto().find((p) => p.productId === contrato.currentProductId);
  const origem = await lerOrigemDaAssinaturaParaTroca(tx, contrato.subscriptionId, paganteId);
  assertAllowed(
    oferta &&
      origem &&
      ((contrato.revision === 1 && contrato.purchaseSelectionProcessedAt !== null) ||
        (contrato.revision > 1 && contrato.currentPlanChangeId && contrato.currentPlanAppliedAt)),
    "CONFLITO",
    "A oferta atual exige conferência.",
  );
  return { contrato, limite: oferta.perfis };
}

async function limites(tx: Transacao) {
  await tx.execute(sql`set local statement_timeout='5s'`);
  await tx.execute(sql`set local lock_timeout='2s'`);
  await tx.execute(sql`set local transaction_timeout='15s'`);
}

/** A busca é só uma pista; o leitor abaixo admite novamente a conta e o grupo. */
export async function lerGrupoDoTitular(autor: IdentidadeNativa) {
  const [grupo] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.ownerUserId, autor.contaId));
  if (grupo) return lerComposicaoDoGrupo(autor, GrupoIdSchema.parse(grupo.id));
  return db.transaction(async (tx) => {
    await limites(tx);
    const nativa = await autorizarContaNativa(tx, autor);
    await nativa.conferirPrazo();
    return null;
  });
}

export async function lerComposicaoDoGrupo(autor: IdentidadeNativa, grupoId: GrupoId) {
  return db.transaction(async (tx) => {
    await limites(tx);
    const atual = await admitirGrupoDoTitular(tx, autor, grupoId, "share");
    const fatos = await lerFatosDoGrupo(grupoId, tx);
    assertAllowed(fatos, "GRUPO", "Grupo não disponível.");
    const plano = decidirPlanoLido(fatos, await atual.nativa.conferirPrazo());
    const revisao = await lerRevisaoDaSelecao(tx, grupoId, autor.contaId, "share");
    return {
      grupoId,
      limite: revisao?.limite ?? plano.limiteDePerfis,
      revisaoDaSelecao: revisao?.contrato.revision ?? null,
      estado: plano.estado,
      perfis: atual.perfis.map((p) => ({
        perfilId: PerfilIdSchema.parse(p.id),
        apelido:
          p.kind === "adult" ||
          atual.vinculos.some((v) => v.perfilId === p.id && v.responsavelId === autor.contaId)
            ? p.nickname
            : "Perfil protegido",
        tipo: p.kind,
        ativo: p.status === "active",
        versao: p.policyVersion,
        selecionado: p.coverageEnabled,
        efetivo:
          p.status === "active" &&
          p.coverageEnabled &&
          fatos.cobertos.includes(PerfilIdSchema.parse(p.id)) &&
          fatos.cobertos.indexOf(PerfilIdSchema.parse(p.id)) < plano.limiteDePerfis,
      })),
    };
  });
}

/** A seleção muda cobertura e revisão, nunca identidade, responsabilidade ou conteúdo. */
export async function gravarCoberturaDoGrupo(
  autor: AutorNativoRecente,
  pedido: ConfirmacaoCoberturaDoGrupo,
) {
  return db.transaction(async (tx) => {
    await limites(tx);
    const atual = await admitirGrupoDoTitular(tx, autor, pedido.grupoId, "update");
    const revisao = await lerRevisaoDaSelecao(tx, pedido.grupoId, autor.contaId, "update");
    assertAllowed(
      revisao
        ? pedido.revisaoDoContrato === revisao.contrato.revision
        : pedido.revisaoDoContrato === undefined,
      "CONFLITO",
      "A oferta mudou. Reabra a cobertura antes de confirmar.",
    );
    const conferirSelecao = async () => {
      const fatos = await lerFatosDoGrupo(pedido.grupoId, tx);
      assertAllowed(fatos, "GRUPO", "Grupo não disponível.");
      const plano = decidirPlanoLido(fatos, await atual.nativa.conferirPrazo(autor.login));
      const aumenta = pedido.perfis.some(
        (p) =>
          p.cobrir &&
          atual.perfis.some((atual) => atual.id === p.perfilId && !atual.coverageEnabled),
      );
      assertAllowed(
        !aumenta || env.RECREIO_FAMILY_MODE !== "off",
        "FAMILIA_INDISPONIVEL",
        "Novas coberturas ainda não estão disponíveis neste acesso.",
      );
      assertAllowed(
        revisao
          ? pedido.perfis.filter((p) => p.cobrir).length <= revisao.limite
          : !aumenta || pedido.perfis.filter((p) => p.cobrir).length <= plano.limiteDePerfis,
        "LIMITE_DE_PERFIS",
        "A seleção excede a cobertura atual do plano.",
      );
    };
    assertAllowed(
      atual.perfis.length === pedido.perfis.length &&
        atual.perfis.every((p) =>
          pedido.perfis.some((e) => e.perfilId === p.id && e.versao === p.policyVersion),
        ),
      "CONFLITO",
      "O grupo mudou. Reabra a gestão antes de continuar.",
    );
    for (const pedidoDoPerfil of pedido.perfis) {
      const perfil = atual.perfis.find((p) => p.id === pedidoDoPerfil.perfilId);
      assertAllowed(perfil, "GRUPO", "Perfil não disponível.");
      assertAllowed(
        !pedidoDoPerfil.cobrir || perfil.status === "active",
        "PERFIL",
        "Perfil não disponível.",
      );
      if (revisao && pedidoDoPerfil.cobrir)
        assertAllowed(
          perfil.kind === "adult" || atual.vinculos.some((v) => v.perfilId === perfil.id),
          "PERFIL",
          "Confira a responsabilidade do perfil antes de selecionar.",
        );
    }
    await conferirSelecao();
    const mudancas = atual.perfis.filter((p) =>
      pedido.perfis.some((e) => e.perfilId === p.id && e.cobrir !== p.coverageEnabled),
    );
    const agora = await atual.nativa.conferirPrazo(autor.login);
    for (const perfil of mudancas) {
      assertAllowed(perfil.policyVersion < 2147483646, "PERFIL", "Perfil não disponível.");
      const escolha = pedido.perfis.find((p) => p.perfilId === perfil.id);
      assertAllowed(escolha, "GRUPO", "Perfil não disponível.");
      await tx
        .update(profiles)
        .set({
          coverageEnabled: escolha.cobrir,
          policyVersion: perfil.policyVersion + 1,
          updatedAt: agora,
        })
        .where(eq(profiles.id, perfil.id));
      const perfilId = PerfilIdSchema.parse(perfil.id);
      await invalidarIngressosDoPerfil(tx, perfilId);
      await encerrarSessoesAbertas(tx, sql`${games.profileId}=${perfilId}`, "permissions_changed", {
        porQuem: "ator",
        contaId: autor.contaId,
      });
      await logAuditEventStrict(
        "recreio.group_coverage_updated",
        autor.contaId,
        {
          app: "recreio",
          groupId: pedido.grupoId,
          profileId: perfilId,
          revision: perfil.policyVersion + 1,
          enabled: escolha.cobrir,
        },
        { writer: tx },
      );
    }
    // Inclui espera do cursor/auditoria e vencimento de cortesia no próprio commit.
    await conferirSelecao();
    if (revisao) {
      const [confirmada] = await tx
        .update(contracts)
        .set({ coverageReviewRequired: false })
        .where(
          and(
            eq(contracts.subscriptionId, revisao.contrato.subscriptionId),
            eq(contracts.revision, revisao.contrato.revision),
            eq(contracts.coverageReviewRequired, true),
          ),
        )
        .returning({ id: contracts.subscriptionId });
      assertAllowed(confirmada, "CONFLITO", "A revisão da seleção mudou. Reabra a cobertura.");
      const comum = {
        app: "recreio",
        groupId: pedido.grupoId,
        subscriptionId: revisao.contrato.subscriptionId,
        revision: revisao.contrato.revision,
        state: "confirmed",
      };
      if (revisao.contrato.currentPlanChangeId)
        await logAuditEventStrict(
          "recreio.plan_change_selection_confirmed",
          autor.contaId,
          { ...comum, planChangeId: revisao.contrato.currentPlanChangeId },
          { writer: tx },
        );
      else
        await logAuditEventStrict(
          "recreio.purchase_selection_confirmed",
          autor.contaId,
          { ...comum, authorizationId: revisao.contrato.purchaseId },
          { writer: tx },
        );
      await atual.nativa.conferirPrazo(autor.login);
    }
    return { alterados: mudancas.length };
  });
}
