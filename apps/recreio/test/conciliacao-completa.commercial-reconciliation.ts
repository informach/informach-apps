import { and, db, eq, sql } from "@informach/db";
import {
  recreioGameSessions as gameSessions,
  recreioBillingReconciliations as jobs,
  subscriptionPaymentPeriods as periods,
  recreioPurchaseAuthorizations as purchases,
  sessions,
  subscriptions,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { avaliarAcesso } from "@/features/acesso/service";
import {
  ConciliacaoIncompleta,
  criarRotinaDeConciliacao,
} from "@/features/cobranca/conciliacao-job";
import { criarProcessadorDeConciliacao } from "@/features/cobranca/conciliacao-service";
import { criarExecutorDeCompra } from "@/features/cobranca/execucao-service";
import { consultarMinhaCobranca, consultarMinhaCompra } from "@/features/cobranca/service";
import { entrarNoJogo, ingressoDe } from "./jogo-apoio";
import { fixtureDePagamento } from "./pagamento-stripe-apoio";
import { pedir } from "./rotas";
import { adultoDoTeste } from "./teste-apoio";

/** Full native/SDK/PG path, exclusively synthetic provider HTTP. These tests do
 * not claim external sandbox communication, actual charges or invoice payment.
 */
async function fixture(comJogador = false) {
  const f = await fixtureDePagamento(comJogador);
  await criarExecutorDeCompra(() => f.runtime)(f.adulto.autor, f.recibo.id);
  const falhas: string[] = [];
  const processar = criarProcessadorDeConciliacao({
    modo: "dev",
    obterRuntime: () => f.runtimeFinanceiro,
    relatarFalha: (entrada) => {
      falhas.push(entrada.reasonCode);
    },
  });
  const job = async () =>
    (
      await db
        .select()
        .from(jobs)
        .where(and(eq(jobs.payerUserId, f.adulto.conta.id), eq(jobs.providerMode, "dev")))
    )[0];
  const reagendar = () =>
    db.execute(
      sql`update recreio.billing_reconciliations set next_attempt_at=clock_timestamp() where payer_user_id=${f.adulto.conta.id} and provider_mode='dev'`,
    );
  return { ...f, falhas, processar, job, reagendar };
}

describe("conciliação nativa com origem, períodos e resultado duráveis", () => {
  it("pagante sem jogador vê apenas a própria situação financeira atual", async () => {
    const f = await fixture(),
      pago = f.concluirCheckout();
    expect((await f.processar()).conciliadas).toBe(1);
    const item = pago.assinatura.items.data[0];
    if (!item) throw new Error("Fixture recurring item absent");
    const estado = await consultarMinhaCobranca(f.adulto.autor);
    expect(estado.financeiro).toMatchObject({
      podeContratar: false,
      temCliente: true,
      assinatura: {
        produtoId: f.entrada.productId,
        estado: "ATIVO",
        fimDoPeriodo: new Date(item.current_period_end * 1000).toISOString(),
      },
    });
    const serializado = JSON.stringify(estado);
    expect(serializado).not.toContain(f.providerCustomerId);
    expect(serializado).not.toContain(pago.assinatura.id);
    const outro = await adultoDoTeste();
    expect((await consultarMinhaCobranca(outro.autor)).financeiro).toEqual({
      podeContratar: true,
      temCliente: false,
      assinatura: null,
    });
  });
  it("grava pagamento/origem e resolve o pedido usando somente GETs no provedor", async () => {
    const f = await fixture(),
      pago = f.concluirCheckout();
    const antes = f.requests.length;
    expect(await f.processar()).toEqual({
      reservadas: 1,
      conciliadas: 1,
      emConferencia: 0,
      falhasTecnicas: 0,
    });
    expect(f.requests.slice(antes).every((r) => r.method === "GET")).toBe(true);
    expect(f.sessions).toHaveLength(1);
    expect(await consultarMinhaCompra(f.adulto.autor)).toMatchObject({
      id: f.recibo.id,
      resolucao: "checkout_completed",
      emConferencia: false,
    });
    const [aceite] = await db.select().from(purchases).where(eq(purchases.id, f.recibo.id));
    expect(aceite?.providerSubscriptionId).toBe(pago.assinatura.id);
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.providerSubscriptionId, pago.assinatura.id));
    if (!sub) throw new Error("Native financial subscription absent");
    expect(
      (await db.select().from(periods).where(eq(periods.subscriptionId, sub.id)))[0],
    ).toMatchObject({ providerInvoiceId: pago.fatura.id, fullyRefunded: false, disputed: false });
    expect(await f.job()).toMatchObject({
      reviewRequired: false,
      reviewReason: null,
      attemptCount: 1,
      leaseToken: null,
    });
    expect((await f.job())?.lastConfirmedAt).toBeInstanceOf(Date);
    expect(f.falhas).toEqual([]);
  });
  it("Checkout concluído sem liquidação mantém pedido pendente e não inventa período", async () => {
    const f = await fixture(),
      pendente = f.concluirCheckout(false);
    expect((await f.processar()).conciliadas).toBe(1);
    expect(await consultarMinhaCompra(f.adulto.autor)).toMatchObject({
      resolucao: null,
      emConferencia: true,
    });
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.providerSubscriptionId, pendente.assinatura.id));
    if (!sub) throw new Error("Pending financial subscription absent");
    expect(sub.status).toBe("incomplete");
    expect(await db.select().from(periods).where(eq(periods.subscriptionId, sub.id))).toEqual([]);
  });
  it("confirmação posterior retoma o mesmo pedido e o mesmo contrato", async () => {
    const f = await fixture(),
      original = f.concluirCheckout(false);
    await f.processar();
    const pago = f.concluirCheckout(true);
    expect(pago.assinatura.id).toBe(original.assinatura.id);
    await f.reagendar();
    expect((await f.processar()).conciliadas).toBe(1);
    expect((await consultarMinhaCompra(f.adulto.autor))?.resolucao).toBe("checkout_completed");
    expect(f.sessions).toHaveLength(1);
  });
  it("falha após pagamento preserva a última confirmação e entra em revisão", async () => {
    const f = await fixture();
    f.concluirCheckout();
    await f.processar();
    const ultima = (await f.job())?.lastConfirmedAt;
    f.indisponibilizar();
    await f.reagendar();
    expect((await f.processar()).emConferencia).toBe(1);
    expect((await f.job())?.lastConfirmedAt).toEqual(ultima);
    expect((await f.job())?.reviewRequired).toBe(true);
    expect(f.falhas).toEqual(["provider_unavailable"]);
  });
  it.each(["pagante", "aceite", "vinculo"] as const)(
    "origem alheia de %s recusa antes da gravação financeira",
    async (tipo) => {
      const f = await fixture(),
        pago = f.concluirCheckout();
      if (tipo === "pagante") pago.assinatura.metadata.subject_id = "payer_foreign_fixture";
      if (tipo === "aceite") pago.assinatura.metadata.checkout_intent_id = "invalid_authorization";
      if (tipo === "vinculo") {
        const s = f.sessions[0];
        if (s) s.subscription = "sub_foreign_fixture";
      }
      expect((await f.processar()).emConferencia).toBe(1);
      expect((await f.job())?.lastConfirmedAt).toBeNull();
      expect((await f.job())?.reviewReason).toBe("foreign_contract");
      expect(
        await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.providerSubscriptionId, pago.assinatura.id)),
      ).toEqual([]);
    },
  );
  it("fatura ausente em observação posterior preserva histórico e exige conferência", async () => {
    const f = await fixture(),
      pago = f.concluirCheckout();
    await f.processar();
    const ultima = (await f.job())?.lastConfirmedAt;
    pago.pago = false;
    await f.reagendar();
    expect((await f.processar()).emConferencia).toBe(1);
    expect((await f.job())?.lastConfirmedAt).toEqual(ultima);
    expect(f.falhas).toEqual(["evidence_mismatch"]);
    expect(
      await db.select().from(periods).where(eq(periods.providerInvoiceId, pago.fatura.id)),
    ).toHaveLength(1);
  });
  it("estorno total fica ligado à fatura conciliada", async () => {
    const f = await fixture(),
      pago = f.concluirCheckout();
    await f.processar();
    pago.charge.refunded = true;
    pago.charge.amount_refunded = pago.charge.amount_captured;
    await f.reagendar();
    expect((await f.processar()).conciliadas).toBe(1);
    expect(
      (await db.select().from(periods).where(eq(periods.providerInvoiceId, pago.fatura.id)))[0]
        ?.fullyRefunded,
    ).toBe(true);
  });
  it("contestação e encerramento favorável são fatos da mesma fatura", async () => {
    const f = await fixture(),
      pago = f.concluirCheckout();
    await f.processar();
    pago.charge.disputed = true;
    pago.disputas.push({ id: "dp_fixture", status: "needs_response" });
    await f.reagendar();
    expect((await f.processar()).conciliadas).toBe(1);
    expect(
      (await db.select().from(periods).where(eq(periods.providerInvoiceId, pago.fatura.id)))[0]
        ?.disputed,
    ).toBe(true);
    const disputa = pago.disputas[0];
    if (!disputa) throw new Error("Fixture dispute absent");
    disputa.status = "won";
    await f.reagendar();
    expect((await f.processar()).conciliadas).toBe(1);
    expect(
      (await db.select().from(periods).where(eq(periods.providerInvoiceId, pago.fatura.id)))[0]
        ?.disputed,
    ).toBe(false);
  });
  it("logout durante confirmação não impede captura técnica nem dá leitura ao login encerrado", async () => {
    const f = await fixture();
    f.concluirCheckout();
    await db.delete(sessions).where(eq(sessions.id, f.adulto.autor.login.authSessionId));
    expect((await f.processar()).conciliadas).toBe(1);
    expect((await f.job())?.lastConfirmedAt).toBeInstanceOf(Date);
    await expect(consultarMinhaCompra(f.adulto.autor)).rejects.toMatchObject({ code: "AUTH" });
  });
  it.each(["estorno", "contestacao", "indisponibilidade", "evidencia-ausente"] as const)(
    "%s corta a SID paga existente e impede reabertura",
    async (tipo) => {
      const f = await fixture(true),
        pago = f.concluirCheckout();
      expect((await f.processar()).conciliadas).toBe(1);
      const jogador = f.adulto.jogador;
      if (!jogador) throw new Error("Native fixture player absent");
      expect(await avaliarAcesso({ profileId: jogador.perfil.id })).toMatchObject({
        podeJogar: true,
        origem: "assinatura",
      });
      const aberta = await entrarNoJogo(jogador);
      if (tipo === "estorno") {
        pago.charge.refunded = true;
        pago.charge.amount_refunded = pago.charge.amount_captured;
      }
      if (tipo === "contestacao") {
        pago.charge.disputed = true;
        pago.disputas.push({ id: "dp_cut_fixture", status: "needs_response" });
      }
      if (tipo === "indisponibilidade") f.indisponibilizar();
      if (tipo === "evidencia-ausente") pago.pago = false;
      await f.reagendar();
      await f.processar();
      expect(await avaliarAcesso({ profileId: jogador.perfil.id })).toMatchObject({
        podeJogar: false,
        estado: "PAGAMENTO_PENDENTE",
      });
      const [sid] = await db.select().from(gameSessions).where(eq(gameSessions.id, aberta.sid));
      expect(sid).toMatchObject({ endReason: "access_lost" });
      expect(sid?.endedAt).toBeInstanceOf(Date);
      expect(sid?.endedSeq).toBeGreaterThan(0);
      expect(
        await pedir("POST", "/api/sdk/v1/sessao/renovar", { token: aberta.token }),
      ).toMatchObject({ status: 403, corpo: { codigo: "SESSAO_ENCERRADA" } });
      await expect(ingressoDe(jogador)).rejects.toMatchObject({ codigo: "ACESSO_NEGADO" });
    },
  );
  it("falha de um pagante preserva atendimento do próximo e falha a rotina operacional", async () => {
    const primeiro = await fixture(),
      segundo = await fixture();
    primeiro.concluirCheckout();
    segundo.concluirCheckout();
    primeiro.indisponibilizar();
    const runtimeA = primeiro.runtimeFinanceiro,
      runtimeB = segundo.runtimeFinanceiro;
    const processar = criarProcessadorDeConciliacao({
      modo: "dev",
      obterRuntime: () => ({
        ...runtimeA,
        leitor: {
          listSubscriptionIds: (customer, budget) =>
            (customer === primeiro.providerCustomerId
              ? runtimeA
              : runtimeB
            ).leitor.listSubscriptionIds(customer, budget),
        },
        financiamento: {
          conferirCliente: (entrada, budget) =>
            (entrada.clienteId === segundo.providerCustomerId
              ? runtimeB
              : runtimeA
            ).financiamento.conferirCliente(entrada, budget),
        },
        lerCheckout: (customer, ...args) =>
          (customer === primeiro.providerCustomerId ? runtimeA : runtimeB).lerCheckout(
            customer,
            ...args,
          ),
      }),
      relatarFalha: () => {},
    });
    const rotina = criarRotinaDeConciliacao({ habilitada: () => true, processar });
    const resultado = await rotina().catch((erro: unknown) => erro);
    expect(resultado).toBeInstanceOf(ConciliacaoIncompleta);
    expect(resultado).toMatchObject({
      name: "ConciliacaoIncompleta",
      resultado: { reservadas: 2, conciliadas: 1, emConferencia: 1, falhasTecnicas: 0 },
    });
    expect(await primeiro.job()).toMatchObject({
      reviewRequired: true,
      lastConfirmedAt: null,
      leaseToken: null,
    });
    expect((await segundo.job())?.lastConfirmedAt).toBeInstanceOf(Date);
    expect(await consultarMinhaCompra(segundo.adulto.autor)).toMatchObject({
      resolucao: "checkout_completed",
      emConferencia: false,
    });
  });
});
