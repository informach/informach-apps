import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import type { inspectUserCheckoutAuthorization } from "@informach/billing/checkout-authorizations";
import { stripeDestination } from "@informach/billing/destinations";
import type { StripeMode } from "@informach/config";
import { and, db, desc, eq, isNull, sql } from "@informach/db";
import {
  customers,
  recreioGroups as groups,
  recreioPurchaseAuthorizations as purchases,
} from "@informach/db/schema";
import { GrupoIdSchema } from "@informach/recreio";
import {
  type AutorNativoRecente,
  autorizarContaNativa,
  type IdentidadeNativa,
} from "@/features/account/autoridade-repository";
import { decidirPlanoLido } from "@/features/acesso/decisao";
import { type FatosDoGrupo, lerFatosDoGrupo } from "@/features/acesso/repository";
import { admitirGrupoDoTitular } from "@/features/grupo/autoridade-repository";
import { VERSAO_DA_DECLARACAO_ADULTA } from "@/features/grupo/convites-constantes";
import {
  GrupoCriadoDuranteEspera,
  prepararGrupoDoTitular,
} from "@/features/grupo/preparar-repository";
import { env } from "@/lib/env";
import { AppError, assertAllowed } from "@/lib/errors";
import { AGORA, codigoDoPostgres, constraintDoPostgres, type Transacao } from "@/lib/repository";
import {
  conferirReplayDaSelecaoDaCompra,
  conferirSelecaoDaCompraNoEnvioLocked,
  lerSelecaoDaCompraLocked,
  registrarSelecaoDaCompraLocked,
} from "./compra-selecao-repository";
import { agendarConciliacaoDaCompra } from "./conciliacao-fila-repository";
import { PRAZO_PARA_INICIAR_COMPRA_MS, VERSAO_DA_COMPRA } from "./constantes";
import { comCicloDeCobranca } from "./lifecycle";
import { type AceiteDaCompra, conferirOfertaDaCompra, type OfertaAceita } from "./regras";

type Compra = typeof purchases.$inferSelect;
function podePrepararCompra(fatos: FatosDoGrupo, agora: Date) {
  return (
    !fatos.assinaturaAtiva &&
    (!fatos.assinaturaInativa ||
      (["canceled", "incomplete_expired"].includes(fatos.assinaturaInativa.status) &&
        fatos.assinaturaInativa.fimDoPeriodo <= agora))
  );
}
async function limites(tx: Transacao) {
  await tx.execute(sql`set local transaction_timeout='15s'`);
  await tx.execute(sql`set local statement_timeout='5s'`);
  await tx.execute(sql`set local lock_timeout='2s'`);
}
async function recibo(tx: Transacao, linha: Compra, conferir?: () => Promise<unknown>) {
  const selecao = await lerSelecaoDaCompraLocked(tx, linha);
  await conferir?.();
  return {
    id: linha.id,
    produtoId: linha.productId,
    tier: linha.tier,
    intervalo: linha.interval,
    valorCentavos: linha.amountCents,
    moeda: linha.currency,
    versaoDasCondicoes: linha.policyVersion,
    versaoDaDeclaracao: linha.adultDeclarationVersion,
    aceitoEm: linha.acceptedAt.toISOString(),
    iniciarAte: new Date(linha.acceptedAt.getTime() + PRAZO_PARA_INICIAR_COMPRA_MS).toISOString(),
    tentativaIniciadaEm: linha.requestStartedAt?.toISOString() ?? null,
    resolvidoEm: linha.resolvedAt?.toISOString() ?? null,
    resolucao: linha.resolution,
    emConferencia: linha.reviewRequired,
    perfis: selecao.map((s) => ({
      perfilId: s.profileReference,
      versao: s.policyVersion,
      cobrir: s.coverageEnabled,
    })),
  };
}
function ofertaConfere(
  linha: Compra,
  oferta: OfertaAceita,
  pedido: AceiteDaCompra,
  modo: StripeMode,
) {
  return (
    linha.providerMode === modo &&
    linha.productId === oferta.productId &&
    linha.tier === oferta.tier &&
    linha.interval === oferta.interval &&
    linha.amountCents === oferta.amountCents &&
    linha.currency === oferta.currency &&
    linha.policyVersion === pedido.versaoDasCondicoes &&
    linha.adultDeclarationVersion === pedido.versaoDaDeclaracao
  );
}

export async function prepararCompraNoBanco(
  autor: AutorNativoRecente,
  pedido: AceiteDaCompra,
  modo: StripeMode,
) {
  const oferta = conferirOfertaDaCompra(pedido);
  return comCicloDeCobranca(autor.contaId, async () => {
    for (const tentativa of [0, 1]) {
      try {
        return await db.transaction(async (tx) => {
          await limites(tx);
          const atual = await prepararGrupoDoTitular(tx, autor, "update");
          await atual.nativa.conferirPrazo(autor.login);
          // Consulta escopada antes de travar: UUID de outra conta não é uma autorização.
          const [existente] = await tx
            .select()
            .from(purchases)
            .where(
              and(
                eq(purchases.id, pedido.pedidoId),
                eq(purchases.payerUserId, autor.contaId),
                eq(purchases.groupId, atual.grupoId),
              ),
            )
            .for("update");
          if (existente) {
            assertAllowed(
              ofertaConfere(existente, oferta, pedido, modo),
              "CONFLITO",
              "Confira o pedido já registrado antes de autorizar outra oferta.",
            );
            await atual.nativa.conferirPrazo(autor.login);
            await conferirReplayDaSelecaoDaCompra(tx, existente, pedido);
            return recibo(tx, existente, () => atual.nativa.conferirPrazo(autor.login));
          }
          const [ativa] = await tx
            .select()
            .from(purchases)
            .where(and(eq(purchases.payerUserId, autor.contaId), isNull(purchases.resolvedAt)))
            .for("update");
          if (ativa) {
            assertAllowed(
              ofertaConfere(ativa, oferta, pedido, modo),
              "CONFLITO",
              "Confira ou encerre o pedido anterior antes de escolher outra oferta.",
            );
            await atual.nativa.conferirPrazo(autor.login);
            await conferirReplayDaSelecaoDaCompra(tx, ativa, pedido);
            return recibo(tx, ativa, () => atual.nativa.conferirPrazo(autor.login));
          }
          const fatos = await lerFatosDoGrupo(atual.grupoId, tx);
          const agoraDaOferta = await atual.nativa.conferirPrazo(autor.login);
          assertAllowed(
            fatos && podePrepararCompra(fatos, agoraDaOferta),
            "COBRANCA",
            "Confira a assinatura existente antes de preparar uma nova compra.",
          );
          const agora = await atual.nativa.conferirPrazo(autor.login);
          const [criada] = await tx
            .insert(purchases)
            .values({
              id: pedido.pedidoId,
              payerUserId: autor.contaId,
              groupId: atual.grupoId,
              providerMode: modo,
              ...oferta,
              policyVersion: pedido.versaoDasCondicoes,
              adultDeclarationVersion: pedido.versaoDaDeclaracao,
              acceptedAt: agora,
            })
            .returning();
          assertAllowed(criada, "COBRANCA", "Não foi possível registrar a autorização.");
          const composicao = await admitirGrupoDoTitular(tx, autor, atual.grupoId, "update");
          await registrarSelecaoDaCompraLocked(tx, criada, pedido, composicao);
          await logAuditEventStrict(
            "recreio.purchase_authorization_recorded",
            autor.contaId,
            {
              app: "recreio",
              groupId: atual.grupoId,
              authorizationId: criada.id,
              productId: criada.productId,
              policyVersion: criada.policyVersion,
              declarationVersion: criada.adultDeclarationVersion,
            },
            { writer: tx },
          );
          await atual.nativa.conferirPrazo(autor.login);
          return recibo(tx, criada, () => atual.nativa.conferirPrazo(autor.login));
        });
      } catch (erro) {
        if (erro instanceof GrupoCriadoDuranteEspera && tentativa === 0) continue;
        if (
          codigoDoPostgres(erro) === "23505" &&
          constraintDoPostgres(erro) === "purchase_authorizations_pkey"
        )
          throw new AppError(
            "CONFLITO",
            "Não foi possível confirmar esse pedido. Confira suas autorizações.",
          );
        throw erro;
      }
    }
    throw new AppError("CONFLITO", "Reabra a compra antes de continuar.");
  });
}

export async function consultarMinhaCompraNoBanco(autor: IdentidadeNativa) {
  const [pista] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.ownerUserId, autor.contaId));
  return db.transaction(async (tx) => {
    await limites(tx);
    if (!pista) {
      const nativa = await autorizarContaNativa(tx, autor, "share", "share", "financeiro");
      await nativa.conferirPrazo();
      return null;
    }
    const grupoId = GrupoIdSchema.parse(pista.id);
    const atual = await admitirGrupoDoTitular(tx, autor, grupoId, "share", "financeiro");
    const [linha] = await tx
      .select()
      .from(purchases)
      .where(and(eq(purchases.payerUserId, autor.contaId), eq(purchases.groupId, grupoId)))
      .orderBy(desc(purchases.acceptedAt), desc(purchases.id))
      .limit(1);
    await atual.nativa.conferirPrazo();
    return linha ? recibo(tx, linha, () => atual.nativa.conferirPrazo()) : null;
  });
}

/** Own payer only, with no player requirement. Courtesy/trial coverage does not
 * mislabel the financial subscription as paid or expose another adult's bill.
 */
export async function consultarSituacaoFinanceiraNoBanco(autor: IdentidadeNativa) {
  const [pista] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.ownerUserId, autor.contaId));
  return db.transaction(async (tx) => {
    await limites(tx);
    if (!pista) {
      const nativa = await autorizarContaNativa(tx, autor, "share", "share", "financeiro");
      await nativa.conferirPrazo();
      return { podeContratar: true, temCliente: false, assinatura: null };
    }
    const grupoId = GrupoIdSchema.parse(pista.id);
    const atual = await admitirGrupoDoTitular(tx, autor, grupoId, "share", "financeiro");
    const fatos = await lerFatosDoGrupo(grupoId, tx);
    assertAllowed(fatos, "COBRANCA", "Assinatura não disponível.");
    const [cliente] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.provider, "stripe"),
          eq(customers.app, "recreio"),
          eq(customers.subjectType, "user"),
          eq(customers.subjectId, autor.contaId),
        ),
      );
    const agora = await atual.nativa.conferirPrazo();
    const decisao = decidirPlanoLido({ ...fatos, concessoes: [] }, agora);
    const assinatura = fatos.assinaturaAtiva ?? fatos.assinaturaInativa;
    return {
      podeContratar: podePrepararCompra(fatos, agora),
      temCliente: Boolean(cliente),
      assinatura: assinatura
        ? {
            produtoId: assinatura.productId,
            estado: decisao.estado,
            fimDoPeriodo: assinatura.fimDoPeriodo.toISOString(),
            cancelamentoEm: assinatura.cancelaEm?.toISOString() ?? null,
          }
        : null,
    };
  });
}

/** Redução de autoridade sem plano ou login recente. Não cancela operação enviada. */
export async function encerrarCompraNaoEnviadaNoBanco(autor: IdentidadeNativa, id: string) {
  return comCicloDeCobranca(autor.contaId, async () => {
    const [pista] = await db
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.ownerUserId, autor.contaId));
    assertAllowed(pista, "COBRANCA", "Pedido não disponível.");
    const grupoId = GrupoIdSchema.parse(pista.id);
    return db.transaction(async (tx) => {
      await limites(tx);
      const atual = await admitirGrupoDoTitular(tx, autor, grupoId, "update", "financeiro");
      const [linha] = await tx
        .select()
        .from(purchases)
        .where(
          and(
            eq(purchases.id, id),
            eq(purchases.groupId, grupoId),
            eq(purchases.payerUserId, autor.contaId),
          ),
        )
        .for("update");
      assertAllowed(linha, "COBRANCA", "Pedido não disponível.");
      if (linha.resolvedAt !== null) {
        assertAllowed(
          linha.resolution === "not_started",
          "COBRANCA",
          "Confira o resultado da compra antes de continuar.",
        );
        await atual.nativa.conferirPrazo();
        return recibo(tx, linha, () => atual.nativa.conferirPrazo());
      }
      assertAllowed(
        linha.requestStartedAt === null,
        "COBRANCA",
        "A tentativa já foi enviada. É preciso conferir o resultado antes de encerrá-la.",
      );
      const agora = await atual.nativa.conferirPrazo();
      const [encerrada] = await tx
        .update(purchases)
        .set({ resolvedAt: agora, resolution: "not_started" })
        .where(eq(purchases.id, id))
        .returning();
      assertAllowed(encerrada, "COBRANCA", "Não foi possível encerrar a autorização.");
      await logAuditEventStrict(
        "recreio.purchase_authorization_closed",
        autor.contaId,
        {
          app: "recreio",
          groupId: grupoId,
          authorizationId: id,
          resolution: "not_started",
        },
        { writer: tx },
      );
      await atual.nativa.conferirPrazo();
      return recibo(tx, encerrada, () => atual.nativa.conferirPrazo());
    });
  });
}

/** Todas as primitivas Locked conservam o ciclo financeiro no chamador. */
async function comCompraParaEnvio<T>(
  autor: AutorNativoRecente,
  id: string,
  executar: (tx: Transacao, linha: Compra, agora: Date) => Promise<T>,
  somenteLeitura = false,
) {
  const [pista] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.ownerUserId, autor.contaId));
  assertAllowed(pista, "COBRANCA", "Pedido não disponível.");
  const grupoId = GrupoIdSchema.parse(pista.id);
  return db.transaction(async (tx) => {
    await limites(tx);
    const atual = await admitirGrupoDoTitular(
      tx,
      autor,
      grupoId,
      "update",
      somenteLeitura ? "financeiro" : "participacao",
    );
    const [linha] = await tx
      .select()
      .from(purchases)
      .where(
        and(
          eq(purchases.id, id),
          eq(purchases.groupId, grupoId),
          eq(purchases.payerUserId, autor.contaId),
        ),
      )
      .for("update");
    assertAllowed(linha, "COBRANCA", "Pedido não disponível.");
    assertAllowed(
      linha.providerMode === env.STRIPE_MODE,
      "COBRANCA",
      "Este pedido pertence a outro ambiente de pagamento.",
    );
    if (!somenteLeitura) {
      assertAllowed(
        !linha.resolvedAt &&
          linha.policyVersion === VERSAO_DA_COMPRA &&
          linha.adultDeclarationVersion === VERSAO_DA_DECLARACAO_ADULTA,
        "COBRANCA",
        "Confira a autorização atual antes de continuar.",
      );
      conferirOfertaDaCompra({
        produtoId: linha.productId,
        valorCentavos: linha.amountCents,
        moeda: linha.currency,
        intervalo: linha.interval,
      });
      if (linha.requestStartedAt === null)
        await conferirSelecaoDaCompraNoEnvioLocked(tx, linha, atual);
    }
    const agora = await atual.nativa.conferirPrazo(autor.login);
    const resultado = await executar(tx, linha, agora);
    await atual.nativa.conferirPrazo(autor.login);
    return resultado;
  });
}

async function iniciarLinha(tx: Transacao, linha: Compra, agora: Date) {
  await agendarConciliacaoDaCompra(tx, {
    paganteId: linha.payerUserId,
    grupoId: linha.groupId,
    modo: linha.providerMode,
  });
  if (linha.requestStartedAt !== null) return linha;
  assertAllowed(
    agora.getTime() < linha.acceptedAt.getTime() + PRAZO_PARA_INICIAR_COMPRA_MS,
    "OFERTA",
    "Esta autorização venceu antes do envio. Encerre-a e confira a oferta atual.",
  );
  const [iniciada] = await tx
    .update(purchases)
    .set({ requestStartedAt: agora })
    .where(eq(purchases.id, linha.id))
    .returning();
  assertAllowed(iniciada, "COBRANCA", "Não foi possível registrar a tentativa.");
  await logAuditEventStrict(
    "recreio.purchase_attempt_started",
    linha.payerUserId,
    {
      app: "recreio",
      groupId: linha.groupId,
      authorizationId: linha.id,
      productId: linha.productId,
    },
    { writer: tx },
  );
  return iniciada;
}

/** Não faz I/O externo; usada antes da conferência somente de leitura do catálogo. */
export function conferirCompraParaEnvioLocked(
  autor: AutorNativoRecente,
  id: string,
  somenteLeitura = false,
) {
  return comCompraParaEnvio(
    autor,
    id,
    async (tx, linha, agora) => {
      assertAllowed(
        somenteLeitura ||
          linha.requestStartedAt !== null ||
          agora.getTime() < linha.acceptedAt.getTime() + PRAZO_PARA_INICIAR_COMPRA_MS,
        "OFERTA",
        "Esta autorização venceu antes do envio. Encerre-a e confira a oferta atual.",
      );
      return recibo(tx, linha);
    },
    somenteLeitura,
  );
}

/** Não cria customer nem retorna URL. A mesma marca não renova o prazo de aceite. */
export function iniciarTentativaDeCompraLocked(autor: AutorNativoRecente, id: string) {
  return comCompraParaEnvio(autor, id, async (tx, linha, agora) =>
    recibo(tx, await iniciarLinha(tx, linha, agora)),
  );
}

const COMPRA_ADMITIDA = Symbol("recreio.compra.admitida");
export type CompraEmCurso = {
  readonly [COMPRA_ADMITIDA]: true;
  readonly id: string;
  readonly payerId: string;
  readonly groupId: string;
  readonly productId: string;
  readonly providerMode: StripeMode;
  readonly startedAt: Date;
  readonly expiresAt: number;
};

/** Capacidade interna, nunca serializada. O resultado externo continua gravável
 * se o login/aparelho for revogado durante o I/O de uma operação já admitida.
 */
export function admitirCompraEmCursoLocked(
  autor: AutorNativoRecente,
  id: string,
): Promise<CompraEmCurso> {
  return comCompraParaEnvio<CompraEmCurso>(autor, id, async (tx, linha, agora) => {
    const iniciada = await iniciarLinha(tx, linha, agora);
    assertAllowed(iniciada.requestStartedAt, "COBRANCA", "Tentativa não admitida.");
    return {
      [COMPRA_ADMITIDA]: true,
      id: iniciada.id,
      payerId: iniciada.payerUserId,
      groupId: iniciada.groupId,
      productId: iniciada.productId,
      providerMode: iniciada.providerMode,
      startedAt: iniciada.requestStartedAt,
      expiresAt: Math.floor(iniciada.acceptedAt.getTime() / 1000) + 3600,
    };
  });
}

/** Consulta uma tentativa já admitida, sem iniciar outra e sem renovar prazos. */
export function admitirConsultaDaCompraLocked(
  autor: AutorNativoRecente,
  id: string,
): Promise<CompraEmCurso> {
  return comCompraParaEnvio<CompraEmCurso>(
    autor,
    id,
    async (_tx, linha) => {
      assertAllowed(linha.requestStartedAt, "COBRANCA", "Este pedido ainda não foi enviado.");
      return {
        [COMPRA_ADMITIDA]: true,
        id: linha.id,
        payerId: linha.payerUserId,
        groupId: linha.groupId,
        productId: linha.productId,
        providerMode: linha.providerMode,
        startedAt: linha.requestStartedAt,
        expiresAt: Math.floor(linha.acceptedAt.getTime() / 1000) + 3600,
      };
    },
    true,
  );
}

/** Conferência recente depois do I/O e antes de devolver uma URL financeira. */
export function conferirDevolucaoDaCompraLocked(
  autor: AutorNativoRecente,
  id: string,
  sessaoId: string,
) {
  return comCompraParaEnvio(autor, id, async (tx, linha) => {
    assertAllowed(
      !linha.reviewRequired && linha.providerSessionId === sessaoId,
      "COBRANCA",
      "Confira o estado da compra antes de continuar.",
    );
    return recibo(tx, linha);
  });
}

/** Dados financeiros só voltam ao aparelho nativo atual, inclusive em resultado
 * terminal. Registrar o fato externo e autorizar sua devolução são atos distintos.
 */
export async function conferirResultadoDaCompraLocked(autor: AutorNativoRecente, id: string) {
  const [pista] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.ownerUserId, autor.contaId));
  assertAllowed(pista, "COBRANCA", "Pedido não disponível.");
  const grupoId = GrupoIdSchema.parse(pista.id);
  return db.transaction(async (tx) => {
    await limites(tx);
    const atual = await admitirGrupoDoTitular(tx, autor, grupoId, "share", "financeiro");
    const [linha] = await tx
      .select()
      .from(purchases)
      .where(
        and(
          eq(purchases.id, id),
          eq(purchases.payerUserId, autor.contaId),
          eq(purchases.groupId, grupoId),
        ),
      );
    assertAllowed(linha, "COBRANCA", "Pedido não disponível.");
    await atual.nativa.conferirPrazo(autor.login);
    return recibo(tx, linha, () => atual.nativa.conferirPrazo(autor.login));
  });
}

/** Apenas fatos da tentativa admitida, sob o ciclo financeiro. Ausência é revisão;
 * Checkout concluído permanece pendente de conciliação de pagamento.
 */
export function capturarEstadoDaCompraLocked(
  prova: CompraEmCurso,
  observado: Awaited<ReturnType<typeof inspectUserCheckoutAuthorization>>,
) {
  assertAllowed(prova[COMPRA_ADMITIDA] === true, "COBRANCA", "Tentativa não admitida.");
  return db.transaction(async (tx) => {
    await limites(tx);
    const [linha] = await tx
      .select()
      .from(purchases)
      .where(
        and(
          eq(purchases.id, prova.id),
          eq(purchases.payerUserId, prova.payerId),
          eq(purchases.groupId, prova.groupId),
          eq(purchases.productId, prova.productId),
          eq(purchases.providerMode, prova.providerMode),
          eq(purchases.requestStartedAt, prova.startedAt),
        ),
      )
      .for("update");
    assertAllowed(linha, "COBRANCA", "Tentativa não disponível.");
    if (observado)
      assertAllowed(
        observado.productId === prova.productId && observado.expiresAt === prova.expiresAt,
        "COBRANCA",
        "O resultado não corresponde à oferta autorizada.",
      );
    const estado = observado?.state ?? null;
    if (estado)
      assertAllowed(
        linha.providerSessionId === null || linha.providerSessionId === estado.id,
        "COBRANCA",
        "A tentativa exige conferência.",
      );
    if (linha.resolvedAt) return recibo(tx, linha);
    if (estado?.subscriptionId)
      assertAllowed(
        linha.providerSubscriptionId === null ||
          linha.providerSubscriptionId === estado.subscriptionId,
        "COBRANCA",
        "A assinatura informada exige conferência.",
      );
    const assinaturaId =
      (estado?.status === "complete" ? estado.subscriptionId : null) ??
      linha.providerSubscriptionId;
    const expirada =
      estado?.status === "expired" && estado.subscriptionId === null && assinaturaId === null;
    let linkValido = false;
    if (
      estado?.status === "open" &&
      estado.url &&
      estado.subscriptionId === null &&
      assinaturaId === null
    ) {
      try {
        stripeDestination(estado.url);
        linkValido = true;
      } catch {
        /* mantém revisão */
      }
    }
    const revisao = !linkValido;
    const sessaoId = estado?.id ?? linha.providerSessionId;
    if (
      !expirada &&
      linha.providerSessionId === sessaoId &&
      linha.providerSubscriptionId === assinaturaId &&
      linha.reviewRequired === revisao
    )
      return recibo(tx, linha);
    const [atualizada] = await tx
      .update(purchases)
      .set({
        providerSessionId: sessaoId,
        providerSubscriptionId: assinaturaId,
        reviewRequired: expirada ? false : revisao,
        ...(expirada ? { resolvedAt: AGORA, resolution: "expired_unpaid" as const } : {}),
      })
      .where(eq(purchases.id, prova.id))
      .returning();
    assertAllowed(atualizada, "COBRANCA", "Não foi possível registrar o resultado.");
    await logAuditEventStrict(
      "recreio.purchase_checkout_observed",
      null,
      {
        app: "recreio",
        groupId: prova.groupId,
        authorizationId: prova.id,
        status: estado?.status ?? "unknown",
      },
      { writer: tx },
    );
    return recibo(tx, atualizada);
  });
}
