import { randomUUID } from "node:crypto";
import { createStripeRecreioClosureInventory } from "@informach/billing/providers/stripe-recreio-closure-inventory";
import { db, eq, sql } from "@informach/db";
import {
  recreioRenewalCancellations as cancellations,
  recreioBillingContracts as contracts,
  customers,
  recreioDeviceSessions as devices,
  recreioAccountClosureFinances as finances,
  recreioRightsOperations as operations,
  recreioAccountParticipations as participations,
  subscriptionPaymentPeriods as periods,
  subscriptions,
} from "@informach/db/schema";
import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { comCicloDeCobranca } from "@/features/cobranca/lifecycle";
import { comFinanceiroPrivadoDeEncerramento } from "@/features/direitos/coordenacao-repository";
import {
  concluirFinanceiroDoEncerramentoLocked,
  escopoDoInventarioDoEncerramento,
  iniciarFinanceiroDoEncerramentoLocked,
  reservarFinanceiroDoEncerramento,
} from "@/features/direitos/encerramento-financeiro-execucao-repository";
import {
  criarProcessadorFinanceiroDoEncerramento,
  criarProcessadorFinanceiroRecuperado,
} from "@/features/direitos/encerramento-financeiro-execucao-service";
import { eventosCom } from "./apoio";
import { livroDoEncerramento, pagamentoParaEncerramento } from "./encerramento-financeiro-apoio";
import { fixtureDoLivro } from "./livro-apoio";
import { adultoDoTeste } from "./teste-apoio";

describe("encerramento: coordenação financeira com PostgreSQL/S3/Stripe SDK reais", () => {
  it("configuração comum ou cópia de cabeçalho congelado não cria escopo financeiro privado", async () => {
    const a = await adultoDoTeste();
    const livro = await livroDoEncerramento(a.autor, () => {
      throw new Error("No private provider composition");
    });
    try {
      const original = await livro.linha(),
        comum = await livro.coordenar();
      const runtime = () => {
        throw new Error("No private provider composition");
      };
      expect(() => criarProcessadorFinanceiroRecuperado(comum, runtime)).toThrow();
      const cabecalho = await livro.storage.congelarCabecalho(
        await livro.storage.lerCabecalho(),
        new Date().toISOString(),
      );
      const copiada = { ...comum, prova: { ...comum.prova, cabecalho } };
      let executada = false;
      expect(() => criarProcessadorFinanceiroRecuperado(copiada, runtime)).toThrow();
      await expect(
        comFinanceiroPrivadoDeEncerramento(copiada, livro.recibo.operacaoId, async () => {
          executada = true;
        }),
      ).rejects.toMatchObject({ code: "DIREITOS_LIVRO" });
      expect(executada).toBe(false);
      expect(await livro.linha()).toEqual(original);
    } finally {
      await livro.fechar();
    }
  });

  it("fila ociosa não abre livro nem compõe Stripe", async () => {
    const livro = fixtureDoLivro();
    try {
      const processar = criarProcessadorFinanceiroDoEncerramento({
        livroId: livro.livroId,
        obterCoordenacao: async () => {
          throw new Error("Idle round must not read external ledger");
        },
        obterRuntime: () => {
          throw new Error("Idle round must not compose provider");
        },
      });
      expect(await processar()).toEqual({ situacao: "ociosa" });
    } finally {
      livro.encerrar();
    }
  });

  it("sem cliente e sem tentativa histórica confirma somente ausência local admitida, sem inventar consulta Stripe", async () => {
    const a = await adultoDoTeste();
    const livro = await livroDoEncerramento(a.autor, () => {
      throw new Error("No-customer proof must not compose Stripe");
    });
    try {
      expect(await livro.processar()).toMatchObject({ situacao: "confirmada" });
      const row = await livro.linha();
      expect(row).toMatchObject({
        state: "confirmed",
        result: "no_customer",
        attempts: 1,
        customerId: null,
        providerCustomerId: null,
        leaseToken: null,
        observationSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      expect(row.observedAt).toBeInstanceOf(Date);
      expect(await livro.processar()).toEqual({ situacao: "ociosa" });
      expect(
        (await db.select().from(participations).where(eq(participations.userId, a.conta.id)))[0],
      ).toMatchObject({ state: "closing" });
      expect(
        (await eventosCom("operationId", livro.recibo.operacaoId)).filter(
          (e) => e.eventType === "recreio.account_closure_finance_confirmed",
        ),
      ).toHaveLength(1);
    } finally {
      await livro.fechar();
    }
  });

  it("cliente sem contrato exige inventário completo no provedor, sem usar o caminho no_customer", async () => {
    const a = await adultoDoTeste(),
      remote = `cus_${randomUUID().replaceAll("-", "")}`;
    await db.insert(customers).values({
      provider: "stripe",
      app: "recreio",
      subjectType: "user",
      subjectId: a.conta.id,
      email: a.conta.email,
      providerCustomerId: remote,
    });
    const calls: string[] = [];
    const transport: typeof fetch = async (url, init) => {
      const request = new Request(url, init),
        path = new URL(request.url).pathname;
      calls.push(`${request.method} ${path}`);
      if (request.method !== "GET") throw new Error("Read-only customer inventory");
      if (path === `/v1/customers/${remote}`)
        return Response.json({
          id: remote,
          livemode: false,
          metadata: { subject_type: "user", subject_id: a.conta.id },
        });
      if (path === "/v1/subscriptions" || path === "/v1/checkout/sessions")
        return Response.json({ object: "list", data: [], has_more: false });
      throw new Error("Unexpected closed inventory read");
    };
    const client = new Stripe("sk_test_closed_empty_customer", {
      apiVersion: "2026-04-22.dahlia",
      maxNetworkRetries: 0,
      httpClient: Stripe.createFetchHttpClient(transport),
    });
    const inventario = createStripeRecreioClosureInventory({
      secretKey: "rk_test_closed_empty_customer",
      mode: "dev",
      client,
    });
    const livro = await livroDoEncerramento(a.autor, () => ({ modo: "dev", inventario }));
    try {
      expect(await livro.processar()).toMatchObject({ situacao: "confirmada" });
      expect(await livro.linha()).toMatchObject({
        state: "confirmed",
        result: "provider_inventory",
      });
      expect(calls).toEqual([
        `GET /v1/customers/${remote}`,
        "GET /v1/subscriptions",
        "GET /v1/checkout/sessions",
      ]);
    } finally {
      await livro.fechar();
    }
  });

  it("enfileira só a renovação necessária com aceite original, continua após logout e preserva os fatos pagos", async () => {
    const f = await pagamentoParaEncerramento();
    const livro = await livroDoEncerramento(f.adulto.autor, () => ({
      modo: "dev",
      inventario: f.inventario,
    }));
    try {
      const [op] = await db
        .select()
        .from(operations)
        .where(eq(operations.id, livro.recibo.operacaoId));
      const [contrato] = await db
        .select()
        .from(contracts)
        .where(eq(contracts.purchaseId, f.recibo.id));
      if (!op || !contrato) throw new Error("Original native financial scope absent");
      const pagos = await db
        .select()
        .from(periods)
        .where(eq(periods.subscriptionId, contrato.subscriptionId));
      expect(pagos.length).toBeGreaterThan(0);
      await db
        .update(devices)
        .set({ revokedAt: sql`clock_timestamp()` })
        .where(eq(devices.id, f.adulto.autor.sessaoDeAparelhoId));
      expect(await livro.processar()).toMatchObject({ situacao: "aguardando_renovacao" });
      const [cancelamento] = await db
        .select()
        .from(cancellations)
        .where(eq(cancellations.subscriptionId, contrato.subscriptionId));
      expect(cancelamento).toMatchObject({
        initiator: "account_closure",
        closureOperationId: op.id,
        authenticatedAt: op.authenticatedAt,
        acceptedAt: op.consentedAt,
        source: op.source,
        state: "accepted",
        requestStartedAt: null,
      });
      expect(f.posts).toEqual([]);
      expect(await f.cancelar()).toMatchObject({ confirmadas: 1 });
      const aguardando = await livro.linha();
      expect(aguardando.state).toBe("waiting");
      expect(aguardando.nextAttemptAt.getTime()).toBeLessThanOrEqual(
        aguardando.updatedAt.getTime(),
      );
      expect(await livro.processar()).toMatchObject({ situacao: "confirmada" });
      expect(await livro.linha()).toMatchObject({
        state: "confirmed",
        result: "provider_inventory",
        attempts: 2,
      });
      expect(f.posts).toEqual(["cancel_at_period_end=true"]);
      expect(f.financeiro.assinatura.status).toBe("active");
      expect(
        await db.select().from(periods).where(eq(periods.subscriptionId, contrato.subscriptionId)),
      ).toEqual(pagos);
      expect(
        (
          await db
            .select()
            .from(contracts)
            .where(eq(contracts.subscriptionId, contrato.subscriptionId))
        )[0],
      ).toEqual(contrato);
    } finally {
      await livro.fechar();
    }
  });

  it("falha de auditoria reverte também o despertar financeiro após a parada remota", async () => {
    const f = await pagamentoParaEncerramento();
    const livro = await livroDoEncerramento(f.adulto.autor, () => ({
      modo: "dev",
      inventario: f.inventario,
    }));
    try {
      expect(await livro.processar()).toMatchObject({ situacao: "aguardando_renovacao" });
      const espera = await livro.linha();
      await db.execute(sql`create function audit.recusar_despertar_financeiro() returns trigger language plpgsql as $$ begin
        if new.event_type='recreio.renewal_cancellation_confirmed' then raise exception 'fixture financial wakeup audit failure' using errcode='P7784'; end if; return new; end $$`);
      await db.execute(
        sql`create trigger recusar_despertar_financeiro before insert on audit.events for each row execute function audit.recusar_despertar_financeiro()`,
      );
      try {
        expect(await f.cancelar()).toMatchObject({ confirmadas: 0, falhasTecnicas: 1 });
        expect(await livro.linha()).toEqual(espera);
        const [cancelamento] = await db
          .select()
          .from(cancellations)
          .where(eq(cancellations.closureOperationId, livro.recibo.operacaoId));
        expect(cancelamento).toMatchObject({
          state: "attempted",
          confirmedAt: null,
          observedAt: null,
        });
        expect(f.posts).toEqual(["cancel_at_period_end=true"]);
        expect(f.financeiro.assinatura.cancel_at_period_end).toBe(true);
      } finally {
        await db.execute(sql`drop trigger recusar_despertar_financeiro on audit.events`);
        await db.execute(sql`drop function audit.recusar_despertar_financeiro()`);
      }
    } finally {
      await livro.fechar();
    }
  });

  it("falha de leitura mantém a conferência sem prova ou cancelamento inventado; pode retomar", async () => {
    const f = await pagamentoParaEncerramento();
    const livro = await livroDoEncerramento(f.adulto.autor, () => ({
      modo: "dev",
      inventario: f.inventario,
    }));
    try {
      f.indisponivel(true);
      expect(await livro.processar()).toMatchObject({ situacao: "revisao" });
      const primeira = await livro.linha();
      expect(primeira).toMatchObject({
        state: "review",
        reviewCode: "provider_unavailable",
        confirmedAt: null,
        observationSha256: null,
        attempts: 1,
      });
      expect(f.posts).toEqual([]);
      f.indisponivel(false);
      await livro.devida();
      expect(await livro.processar()).toMatchObject({ situacao: "aguardando_renovacao" });
      expect(await livro.linha()).toMatchObject({
        state: "waiting",
        requestStartedAt: primeira.requestStartedAt,
        createdAt: primeira.createdAt,
        attempts: 2,
      });
    } finally {
      await livro.fechar();
    }
  });

  it.each(["namespace", "foreign_payer"])(
    "recusa %s antes de admitir cancelamento",
    async (change) => {
      const f = await pagamentoParaEncerramento();
      const livro = await livroDoEncerramento(f.adulto.autor, () => ({
        modo: change === "namespace" ? "prod" : "dev",
        inventario: f.inventario,
      }));
      try {
        if (change === "foreign_payer") f.outroPagante(true);
        expect(await livro.processar()).toMatchObject({ situacao: "revisao" });
        expect(await livro.linha()).toMatchObject({
          state: "review",
          reviewCode: change === "namespace" ? "namespace_mismatch" : "foreign_contract",
          confirmedAt: null,
        });
        expect(
          await db
            .select()
            .from(cancellations)
            .where(eq(cancellations.closureOperationId, livro.recibo.operacaoId)),
        ).toEqual([]);
        expect(f.posts).toEqual([]);
      } finally {
        await livro.fechar();
      }
    },
  );

  it("origem alterada durante a rede impede gravar prova ou enfileirar efeito", async () => {
    const f = await pagamentoParaEncerramento();
    const livro = await livroDoEncerramento(f.adulto.autor, () => ({
      modo: "dev",
      inventario: f.inventario,
    }));
    try {
      let alterada = false;
      f.aposInventario(async () => {
        if (!alterada) {
          alterada = true;
          await db
            .update(subscriptions)
            .set({ currentPeriodEnd: sql`${subscriptions.currentPeriodEnd}+interval '1 day'` })
            .where(eq(subscriptions.providerSubscriptionId, f.financeiro.assinatura.id));
        }
      });
      expect(await livro.processar()).toMatchObject({ situacao: "revisao" });
      expect(alterada).toBe(true);
      expect(await livro.linha()).toMatchObject({
        state: "review",
        reviewCode: "invalid_evidence",
        confirmedAt: null,
      });
      expect(
        await db
          .select()
          .from(cancellations)
          .where(eq(cancellations.closureOperationId, livro.recibo.operacaoId)),
      ).toEqual([]);
    } finally {
      await livro.fechar();
    }
  });

  it("auditoria indisponível reverte confirmação e fica como falha técnica, sem culpar o provedor", async () => {
    const a = await adultoDoTeste();
    const livro = await livroDoEncerramento(a.autor, () => {
      throw new Error("Unexpected provider");
    });
    try {
      await db.execute(
        sql`create function audit.recusar_financeiro_encerramento() returns trigger language plpgsql as $$ begin if new.event_type='recreio.account_closure_finance_confirmed' then raise exception 'auditoria indisponivel'; end if; return new; end $$`,
      );
      await db.execute(
        sql`create trigger recusar_financeiro_encerramento before insert on audit.events for each row execute function audit.recusar_financeiro_encerramento()`,
      );
      try {
        await expect(livro.processar()).rejects.toMatchObject({ reasonCode: "technical_failure" });
        expect(await livro.linha()).toMatchObject({
          state: "attempted",
          reviewCode: null,
          confirmedAt: null,
          observationSha256: null,
        });
      } finally {
        await db.execute(sql`drop trigger recusar_financeiro_encerramento on audit.events`);
        await db.execute(sql`drop function audit.recusar_financeiro_encerramento()`);
      }
      const primeira = await livro.linha();
      await db
        .update(finances)
        .set({ leaseToken: null, leaseUntil: null, nextAttemptAt: sql`clock_timestamp()` })
        .where(eq(finances.operationId, livro.recibo.operacaoId));
      expect(await livro.processar()).toMatchObject({ situacao: "confirmada" });
      expect(await livro.linha()).toMatchObject({
        state: "confirmed",
        attempts: 2,
        requestStartedAt: primeira.requestStartedAt,
      });
    } finally {
      await livro.fechar();
    }
  });

  it("duas execuções não duplicam a fila de renovação do mesmo encerramento", async () => {
    const f = await pagamentoParaEncerramento();
    const livro = await livroDoEncerramento(f.adulto.autor, () => ({
      modo: "dev",
      inventario: f.inventario,
    }));
    try {
      const results = await Promise.all([livro.processar(), livro.processar()]);
      expect(results.filter((r) => r.situacao === "aguardando_renovacao")).toHaveLength(1);
      expect(
        await db
          .select()
          .from(cancellations)
          .where(eq(cancellations.closureOperationId, livro.recibo.operacaoId)),
      ).toHaveLength(1);
      expect(
        (await eventosCom("operationId", livro.recibo.operacaoId)).filter(
          (e) => e.eventType === "recreio.account_closure_renewals_queued",
        ),
      ).toHaveLength(1);
    } finally {
      await livro.fechar();
    }
  });

  it("cópia de observação ou observação de outra operação não autoriza efeito financeiro", async () => {
    const f = await pagamentoParaEncerramento();
    const livro = await livroDoEncerramento(f.adulto.autor, () => ({
      modo: "dev",
      inventario: f.inventario,
    }));
    try {
      const config = await livro.coordenar(),
        trabalho = await reservarFinanceiroDoEncerramento(config);
      if (!trabalho) throw new Error("Financial work absent");
      await comCicloDeCobranca(trabalho.contaId, async () => {
        const tentativa = await iniciarFinanceiroDoEncerramentoLocked(trabalho, config);
        const scope = escopoDoInventarioDoEncerramento(tentativa, Date.now() + 90_000);
        const observed = await f.inventario.inspect(scope);
        await expect(
          concluirFinanceiroDoEncerramentoLocked(tentativa, config, structuredClone(observed)),
        ).rejects.toMatchObject({ code: "invalid_evidence" });
        const other = await f.inventario.inspect({ ...scope, operationId: randomUUID() });
        await expect(
          concluirFinanceiroDoEncerramentoLocked(tentativa, config, other),
        ).rejects.toMatchObject({ code: "invalid_evidence" });
      });
      expect((await livro.linha()).confirmedAt).toBeNull();
      expect(
        await db
          .select()
          .from(cancellations)
          .where(eq(cancellations.closureOperationId, livro.recibo.operacaoId)),
      ).toEqual([]);
    } finally {
      await livro.fechar();
    }
  });
});
