import { randomUUID } from "node:crypto";
import { createStripeRecreioRenewals } from "@informach/billing/providers/stripe-recreio-renewals";
import { db, eq, sql } from "@informach/db";
import {
  recreioRenewalCancellations as cancellations,
  recreioBillingContracts as contracts,
  recreioDeviceSessions as devices,
  subscriptionPaymentPeriods as periods,
} from "@informach/db/schema";
import { describe, expect, it } from "vitest";
import { criarProcessadorDeConciliacao } from "@/features/cobranca/conciliacao-service";
import { criarExecutorDeCompra } from "@/features/cobranca/execucao-service";
import { comCicloDeCobranca } from "@/features/cobranca/lifecycle";
import {
  AceiteDoCancelamentoDaRenovacaoSchema,
  VERSAO_DO_CANCELAMENTO_DA_RENOVACAO,
} from "@/features/cobranca/renovacao-contrato";
import {
  confirmarCancelamentoDaRenovacaoLocked,
  iniciarCancelamentoDaRenovacaoLocked,
  reservarCancelamentoDaRenovacao,
} from "@/features/cobranca/renovacao-execucao-repository";
import { criarProcessadorDeCancelamentoDaRenovacao } from "@/features/cobranca/renovacao-execucao-service";
import {
  CancelamentoDaRenovacaoIncompleto,
  criarRotinaDeCancelamentoDaRenovacao,
} from "@/features/cobranca/renovacao-job";
import { aceitarCancelamentoDaRenovacaoNoBanco as aceitar } from "@/features/cobranca/renovacao-repository";
import { eventosCom } from "./apoio";
import { fixtureDePagamento } from "./pagamento-stripe-apoio";

async function fixture() {
  let paganteId = "",
    customerId = "";
  let remoto: { id: string; cancel_at_period_end: boolean } | undefined;
  let perder = false,
    aplicar = true;
  const posts: string[] = [];
  const f = await fixtureDePagamento(false, "recreio_individual_monthly", async (request) => {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === `/v1/customers/${customerId}`)
      return Response.json({
        id: customerId,
        object: "customer",
        livemode: false,
        balance: 0,
        metadata: { subject_type: "user", subject_id: paganteId },
      });
    if (remoto && request.method === "POST" && path === `/v1/subscriptions/${remoto.id}`) {
      posts.push(await request.text());
      if (aplicar) remoto.cancel_at_period_end = true;
      if (perder) {
        perder = false;
        throw new TypeError("Private closed response lost");
      }
      return Response.json(remoto);
    }
    return null;
  });
  paganteId = f.adulto.conta.id.toString();
  customerId = f.providerCustomerId;
  await criarExecutorDeCompra(() => f.runtime)(f.adulto.autor, f.recibo.id);
  const financeiro = f.concluirCheckout();
  remoto = financeiro.assinatura;
  const conciliar = criarProcessadorDeConciliacao({
    modo: "dev",
    obterRuntime: () => f.runtimeFinanceiro,
    relatarFalha: () => {},
  });
  await conciliar();
  const [contrato] = await db.select().from(contracts).where(eq(contracts.purchaseId, f.recibo.id));
  if (!contrato) throw new Error("Synthetic native contract absent");
  const falhas: string[] = [];
  const provider = createStripeRecreioRenewals({
    secretKey: "rk_test_closed_native",
    mode: "dev",
    client: f.stripe,
  });
  const processar = criarProcessadorDeCancelamentoDaRenovacao({
    modo: "dev",
    obterRuntime: () => ({ modo: "dev", renovacoes: provider }),
    relatarFalha: ({ reasonCode }) => {
      falhas.push(reasonCode);
    },
  });
  // The disposable suite deliberately retains other accounts' fixtures. Drain
  // their due work through the real worker before admitting this test's receipt;
  // the closed HTTP transport cannot confirm another fixture's contract.
  for (let n = 0; n < 64; n++) {
    if ((await processar()).reservadas === 0) break;
  }
  falhas.length = 0;
  const pedido = AceiteDoCancelamentoDaRenovacaoSchema.parse({
    pedidoId: randomUUID(),
    assinaturaId: contrato.subscriptionId,
    revisaoDoContrato: contrato.revision,
    confirmoCancelamentoDaRenovacao: true,
    versaoDasCondicoes: VERSAO_DO_CANCELAMENTO_DA_RENOVACAO,
  });
  await aceitar(f.adulto.autor, pedido, { modo: "dev", fonte: "a".repeat(40) });
  async function linha() {
    const [row] = await db
      .select()
      .from(cancellations)
      .where(eq(cancellations.id, pedido.pedidoId));
    if (!row) throw new Error("Native cancellation absent");
    return row;
  }
  return {
    ...f,
    financeiro,
    contrato,
    pedido,
    posts,
    processar,
    conciliar,
    linha,
    falhas,
    perderResposta() {
      perder = true;
    },
    ignorarAlteracao() {
      aplicar = false;
    },
  };
}

describe("cancelamento: tentativa durável e confirmação com PostgreSQL/SDK reais", () => {
  it("encerra apenas a renovação após logout, preserva período/fatos pagos e confirma atomicamente", async () => {
    const f = await fixture();
    const antes = await db
      .select()
      .from(periods)
      .where(eq(periods.subscriptionId, f.contrato.subscriptionId));
    expect(antes.length).toBeGreaterThan(0);
    await db
      .update(devices)
      .set({ revokedAt: sql`clock_timestamp()` })
      .where(eq(devices.id, f.adulto.autor.sessaoDeAparelhoId));
    expect(await f.processar()).toMatchObject({
      confirmadas: 1,
      emConferencia: 0,
      falhasTecnicas: 0,
    });
    const row = await f.linha();
    expect(row).toMatchObject({
      state: "confirmed",
      attempts: 1,
      providerResult: "scheduled",
      leaseToken: null,
      reviewCode: null,
    });
    expect(row.observedAt).toBeInstanceOf(Date);
    expect(row.confirmedAt).toEqual(row.observedAt);
    expect(row.providerStopAt?.getTime()).toBeGreaterThan(row.confirmedAt?.getTime() ?? Infinity);
    expect(f.posts).toEqual(["cancel_at_period_end=true"]);
    expect(f.financeiro.assinatura.status).toBe("active");
    expect(
      await db.select().from(periods).where(eq(periods.subscriptionId, f.contrato.subscriptionId)),
    ).toEqual(antes);
    expect(
      (
        await db
          .select()
          .from(contracts)
          .where(eq(contracts.subscriptionId, f.contrato.subscriptionId))
      )[0],
    ).toEqual(f.contrato);
    expect((await eventosCom("cancellationId", row.id)).map((e) => e.eventType)).toEqual(
      expect.arrayContaining([
        "recreio.renewal_cancellation_attempt_started",
        "recreio.renewal_cancellation_confirmed",
      ]),
    );
    expect(await f.processar()).toMatchObject({ reservadas: 0 });
    expect(await f.linha()).toEqual(row);
  });

  it("resposta perdida mantém conferência e recupera o efeito sem repetir POST", async () => {
    const f = await fixture();
    f.perderResposta();
    expect(await f.processar()).toMatchObject({ confirmadas: 0, emConferencia: 1 });
    const primeira = await f.linha();
    expect(primeira).toMatchObject({
      state: "review",
      attempts: 1,
      reviewCode: "provider_unavailable",
      observedAt: null,
      confirmedAt: null,
      leaseToken: null,
    });
    expect(primeira.nextAttemptAt.getTime()).toBeGreaterThan(primeira.updatedAt.getTime());
    await db
      .update(cancellations)
      .set({ nextAttemptAt: sql`clock_timestamp()` })
      .where(eq(cancellations.id, primeira.id));
    expect(await f.processar()).toMatchObject({ confirmadas: 1, emConferencia: 0 });
    expect(await f.linha()).toMatchObject({
      state: "confirmed",
      attempts: 2,
      requestStartedAt: primeira.requestStartedAt,
      authenticatedAt: primeira.authenticatedAt,
      acceptedAt: primeira.acceptedAt,
      source: primeira.source,
    });
    expect(f.posts).toHaveLength(1);
  });

  it("duas execuções concorrentes não enviam duas mutações do mesmo contrato", async () => {
    const f = await fixture();
    const results = await Promise.all([f.processar(), f.processar()]);
    expect(results.reduce((total, r) => total + r.confirmadas, 0)).toBe(1);
    expect(f.posts).toHaveLength(1);
    expect(await f.linha()).toMatchObject({ state: "confirmed", attempts: 1 });
  });

  it("falha de auditoria após POST não grava confirmação; retomada lê efeito existente", async () => {
    const f = await fixture();
    await db.execute(
      sql`create function audit.recusar_renovacao_confirmacao() returns trigger language plpgsql as $$ begin if new.event_type='recreio.renewal_cancellation_confirmed' then raise exception 'auditoria indisponivel'; end if; return new; end $$`,
    );
    await db.execute(
      sql`create trigger recusar_renovacao_confirmacao before insert on audit.events for each row execute function audit.recusar_renovacao_confirmacao()`,
    );
    try {
      expect(await f.processar()).toMatchObject({ confirmadas: 0, falhasTecnicas: 1 });
      expect(await f.linha()).toMatchObject({
        state: "attempted",
        observedAt: null,
        confirmedAt: null,
      });
    } finally {
      await db.execute(sql`drop trigger recusar_renovacao_confirmacao on audit.events`);
      await db.execute(sql`drop function audit.recusar_renovacao_confirmacao()`);
    }
    await db
      .update(cancellations)
      .set({ leaseToken: null, leaseUntil: null, nextAttemptAt: sql`clock_timestamp()` })
      .where(eq(cancellations.id, f.pedido.pedidoId));
    expect(await f.processar()).toMatchObject({ confirmadas: 1 });
    expect(f.posts).toHaveLength(1);
  });

  it("sucesso HTTP sem efeito real falha a rotina operacional e não muda tempo pago", async () => {
    const f = await fixture();
    f.ignorarAlteracao();
    const rotina = criarRotinaDeCancelamentoDaRenovacao({
      habilitada: () => true,
      processar: f.processar,
    });
    await expect(rotina()).rejects.toBeInstanceOf(CancelamentoDaRenovacaoIncompleto);
    expect(await f.linha()).toMatchObject({
      state: "review",
      reviewCode: "invalid_evidence",
      confirmedAt: null,
    });
    expect(f.falhas).toEqual(["invalid_evidence"]);
    expect(f.financeiro.assinatura.cancel_at_period_end).toBe(false);
  });

  it("não confirma uma observação fabricada mesmo com reserva e tentativa próprias", async () => {
    const f = await fixture();
    const trabalho = await reservarCancelamentoDaRenovacao("dev");
    if (!trabalho || trabalho.id !== f.pedido.pedidoId)
      throw new Error("Synthetic work not reserved");
    await comCicloDeCobranca(trabalho.paganteId, async () => {
      const tentativa = await iniciarCancelamentoDaRenovacaoLocked(trabalho);
      await expect(
        confirmarCancelamentoDaRenovacaoLocked(tentativa, {
          outcome: "terminal",
          stopsAt: null,
          sha256: "f".repeat(64),
        }),
      ).rejects.toMatchObject({ code: "invalid_evidence" });
    });
    expect(await f.linha()).toMatchObject({ state: "attempted", confirmedAt: null });
    expect(f.posts).toHaveLength(0);
  });

  it("recusa cópia e data alterada da resposta real sem confirmar o recibo", async () => {
    const f = await fixture();
    const trabalho = await reservarCancelamentoDaRenovacao("dev");
    if (!trabalho || trabalho.id !== f.pedido.pedidoId)
      throw new Error("Synthetic work not reserved");
    await comCicloDeCobranca(trabalho.paganteId, async () => {
      const tentativa = await iniciarCancelamentoDaRenovacaoLocked(trabalho);
      const provider = createStripeRecreioRenewals({
        secretKey: "rk_test_closed_native",
        mode: "dev",
        client: f.stripe,
      });
      const resposta = await provider.stop(tentativa.entrada);
      await expect(
        confirmarCancelamentoDaRenovacaoLocked(tentativa, structuredClone(resposta)),
      ).rejects.toMatchObject({ code: "invalid_evidence" });
      if (!resposta.stopsAt) throw new Error("Missing observed stop");
      resposta.stopsAt.setTime(resposta.stopsAt.getTime() + 60_000);
      await expect(
        confirmarCancelamentoDaRenovacaoLocked(tentativa, resposta),
      ).rejects.toMatchObject({ code: "invalid_evidence" });
      expect(await f.linha()).toMatchObject({ state: "attempted", confirmedAt: null });
      await confirmarCancelamentoDaRenovacaoLocked(
        tentativa,
        await provider.stop(tentativa.entrada),
      );
    });
    expect(await f.linha()).toMatchObject({ state: "confirmed", providerResult: "scheduled" });
    expect(f.posts).toEqual(["cancel_at_period_end=true"]);
  });

  it("reserva retomada impede confirmação pelo executor antigo", async () => {
    const f = await fixture();
    const trabalho = await reservarCancelamentoDaRenovacao("dev");
    if (!trabalho || trabalho.id !== f.pedido.pedidoId)
      throw new Error("Synthetic work not reserved");
    await comCicloDeCobranca(trabalho.paganteId, async () => {
      const tentativa = await iniciarCancelamentoDaRenovacaoLocked(trabalho);
      await db
        .update(cancellations)
        .set({ leaseToken: randomUUID() })
        .where(eq(cancellations.id, trabalho.id));
      await expect(
        confirmarCancelamentoDaRenovacaoLocked(tentativa, {
          outcome: "terminal",
          stopsAt: null,
          sha256: "f".repeat(64),
        }),
      ).rejects.toMatchObject({ code: "CONFLITO" });
    });
    expect(await f.linha()).toMatchObject({ state: "attempted", confirmedAt: null });
    expect(f.posts).toHaveLength(0);
  });
});
