import { randomUUID } from "node:crypto";
import { createStripePaymentFactReader } from "@informach/billing/payment-facts";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioBillingReconciliations as jobs,
  webhookEvents,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { avaliarAcesso } from "@/features/acesso/service";
import { criarProcessadorDeConciliacao } from "@/features/cobranca/conciliacao-service";
import { criarExecutorDeCompra } from "@/features/cobranca/execucao-service";
import { criarReceptorDoWebhook } from "@/features/cobranca/webhook-service";
import { entrarNoJogo } from "./jogo-apoio";
import { fixtureDePagamento } from "./pagamento-stripe-apoio";

/** Actual Stripe signature verification and SDK decoding with a closed HTTP
 * fixture. Native payer, admission, queue, audit and SID use PostgreSQL.
 * This is not communication with Stripe Sandbox.
 */
async function fixture(comJogador = false) {
  const f = await fixtureDePagamento(comJogador);
  await criarExecutorDeCompra(() => f.runtime)(f.adulto.autor, f.recibo.id);
  const pago = f.concluirCheckout();
  const processar = criarProcessadorDeConciliacao({
    modo: "dev",
    obterRuntime: () => f.runtimeFinanceiro,
    relatarFalha: () => {},
  });
  expect((await processar()).conciliadas).toBe(1);
  const leitor = createStripePaymentFactReader({
    secretKey: "unused",
    client: f.stripe,
    expectedMode: "dev",
  });
  const receber = criarReceptorDoWebhook(() => ({
    modo: "dev",
    verificar: f.provider.verifyWebhookSignature,
    clienteDoEvento: leitor.eventCustomerId,
  }));
  const evento = (
    type: string,
    object: Record<string, unknown> = {
      id: pago.assinatura.id,
      customer: f.providerCustomerId,
      livemode: false,
      status: "active",
    },
  ) => ({
    id: `evt_${randomUUID().replaceAll("-", "")}`,
    type,
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: { object },
  });
  const pedido = (dados: ReturnType<typeof evento>, assinaturaValida = true) => {
    const payload = JSON.stringify(dados);
    const signature = f.stripe.webhooks.generateTestHeaderString({
      payload,
      secret: assinaturaValida ? "unused" : "wrong_fixture_secret",
    });
    return new Request("https://recreio.example.test/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": signature, "content-type": "application/json" },
      body: payload,
    });
  };
  const job = async () =>
    (
      await db
        .select()
        .from(jobs)
        .where(and(eq(jobs.payerUserId, f.adulto.conta.id), eq(jobs.providerMode, "dev")))
    )[0];
  return { ...f, pago, processar, receber, evento, pedido, job };
}

describe("webhook nativo assinado e reconciliação financeira", () => {
  it("evento positivo agenda GET completo, sem atualizar confirmação ou conceder acesso pelo payload", async () => {
    const f = await fixture(),
      antes = await f.job();
    const evento = f.evento("invoice.paid", {
      id: f.pago.fatura.id,
      customer: f.providerCustomerId,
      livemode: false,
      customer_email: "not-retained@example.test",
    });
    const chamadas = f.requests.length;
    expect(await f.receber(f.pedido(evento))).toEqual({ status: "scheduled" });
    expect(await f.job()).toMatchObject({
      lastConfirmedAt: antes?.lastConfirmedAt,
      reviewRequired: false,
    });
    expect(f.requests.slice(chamadas)).toEqual([]);
    const [recibo] = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.providerEventId, `recreio-native:dev:${evento.id}`));
    expect(recibo?.processedAt).toBeInstanceOf(Date);
    expect(recibo?.payload).toEqual({
      id: evento.id,
      type: evento.type,
      created: evento.created,
      livemode: false,
      objectId: f.pago.fatura.id,
      adverse: false,
    });
    expect((await f.processar()).conciliadas).toBe(1);
  });
  it("evento adverso corta SID; replay antigo não suspende o pagamento recuperado", async () => {
    const f = await fixture(true),
      jogador = f.adulto.jogador;
    if (!jogador) throw new Error("Fixture player absent");
    const aberta = await entrarNoJogo(jogador),
      antes = await f.job();
    const evento = f.evento("charge.refunded", {
      id: f.pago.charge.id,
      customer: f.providerCustomerId,
      livemode: false,
      refunded: true,
    });
    expect(await f.receber(f.pedido(evento))).toEqual({ status: "scheduled" });
    expect(await f.job()).toMatchObject({
      lastConfirmedAt: antes?.lastConfirmedAt,
      reviewRequired: true,
      reviewReason: "adverse_event",
    });
    expect(await avaliarAcesso({ profileId: jogador.perfil.id })).toMatchObject({
      podeJogar: false,
      estado: "PAGAMENTO_PENDENTE",
    });
    const [encerrada] = await db.select().from(games).where(eq(games.id, aberta.sid));
    expect(encerrada).toMatchObject({ endReason: "access_lost", endedAt: expect.any(Date) });
    expect(encerrada?.endedSeq).toBeGreaterThan(0);
    // This is a late notification. Complete current provider facts still show
    // the valid paid invoice and recover access without rewriting the event.
    expect((await f.processar()).conciliadas).toBe(1);
    const nova = await entrarNoJogo(jogador);
    const confirmada = await f.job();
    expect(await f.receber(f.pedido(evento))).toEqual({ status: "duplicate" });
    expect(await f.job()).toMatchObject({
      lastConfirmedAt: confirmada?.lastConfirmedAt,
      reviewRequired: false,
      nextAttemptAt: confirmada?.nextAttemptAt,
    });
    expect((await db.select().from(games).where(eq(games.id, nova.sid)))[0]?.endedAt).toBeNull();
  });
  it("assinatura inválida e modo estrangeiro não alteram a fila", async () => {
    const f = await fixture(),
      antes = await f.job(),
      evento = f.evento("invoice.paid");
    await expect(f.receber(f.pedido(evento, false))).rejects.toThrow();
    await expect(f.receber(f.pedido({ ...evento, livemode: true }))).rejects.toMatchObject({
      code: "ORIGEM_FINANCEIRA",
    });
    expect(await f.job()).toEqual(antes);
  });
  it("corpo excessivo é recusado antes da composição financeira", async () => {
    const f = await fixture(),
      antes = await f.job();
    await expect(
      f.receber(
        new Request("https://recreio.example.test/api/webhooks/stripe", {
          method: "POST",
          body: "x".repeat(1_048_577),
        }),
      ),
    ).rejects.toThrow();
    expect(await f.job()).toEqual(antes);
  });
  it("cliente desconhecido e evento fora do contrato são ignorados sem recibo financeiro", async () => {
    const f = await fixture(),
      antes = await f.job();
    const desconhecido = f.evento("invoice.paid", {
      id: "in_unknown_fixture",
      customer: "cus_unknown_fixture",
      livemode: false,
    });
    expect(await f.receber(f.pedido(desconhecido))).toEqual({ status: "ignored" });
    expect(await f.receber(f.pedido(f.evento("product.updated")))).toEqual({ status: "ignored" });
    expect(await f.job()).toEqual(antes);
    expect(
      await db
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.providerEventId, `recreio-native:dev:${desconhecido.id}`)),
    ).toEqual([]);
  });
  it("falha de auditoria reverte recibo e fila e permite repetir a mesma entrega", async () => {
    const f = await fixture(),
      antes = await f.job(),
      evento = f.evento("invoice.paid");
    await db.execute(
      sql`create function recreio.recusar_auditoria_webhook_fixture() returns trigger language plpgsql as $$ begin if new.event_type='recreio.billing_provider_event_received' then raise exception 'fixture webhook audit failure'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger recusar_auditoria_webhook_fixture before insert on audit.events for each row execute function recreio.recusar_auditoria_webhook_fixture()`,
    );
    try {
      await expect(f.receber(f.pedido(evento))).rejects.toThrow();
      expect(await f.job()).toEqual(antes);
      expect(
        await db
          .select()
          .from(webhookEvents)
          .where(eq(webhookEvents.providerEventId, `recreio-native:dev:${evento.id}`)),
      ).toEqual([]);
    } finally {
      await db.execute(sql`drop trigger recusar_auditoria_webhook_fixture on audit.events`);
      await db.execute(sql`drop function recreio.recusar_auditoria_webhook_fixture()`);
    }
    expect(await f.receber(f.pedido(evento))).toEqual({ status: "scheduled" });
  });
});
