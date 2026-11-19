import { randomUUID } from "node:crypto";
import { createStripeRecreioClosureInventory } from "@informach/billing/providers/stripe-recreio-closure-inventory";
import { createStripeRecreioRenewals } from "@informach/billing/providers/stripe-recreio-renewals";
import { db, eq, sql } from "@informach/db";
import { recreioAccountClosureFinances as finances } from "@informach/db/schema";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { criarProcessadorDeConciliacao } from "@/features/cobranca/conciliacao-service";
import { criarExecutorDeCompra } from "@/features/cobranca/execucao-service";
import { criarProcessadorDeCancelamentoDaRenovacao } from "@/features/cobranca/renovacao-execucao-service";
import {
  criarProcessadorFinanceiroDoEncerramento,
  type RuntimeFinanceiroDoEncerramento,
} from "@/features/direitos/encerramento-financeiro-execucao-service";
import { criarArmazenamentoDoLivro } from "@/features/direitos/livro/armazenamento";
import { conferirPrefixoDoLivro } from "@/features/direitos/livro/leitura";
import { prepararEncerramentoNoBanco } from "@/features/direitos/preparacao-repository";
import { publicarProximoConsentimento } from "@/features/direitos/publicacao-repository";
import { consentirEncerramentoNoBanco } from "@/features/direitos/retirada-consentimento-repository";
import { fixtureDoLivro } from "./livro-apoio";
import { criarBucketDoLivro } from "./livro-s3-apoio";
import { fixtureDePagamento } from "./pagamento-stripe-apoio";

/** Real native consent, PostgreSQL and S3 SDK/HTTP ledger. No public closure
 * action or destructive account effects are claimed by these fixtures. */
export async function livroDoEncerramento(
  autor: AutorNativoRecente,
  obterRuntime: () => RuntimeFinanceiroDoEncerramento,
) {
  const livro = fixtureDoLivro(),
    http = await criarBucketDoLivro();
  try {
    const storage = criarArmazenamentoDoLivro({
      cliente: http.cliente,
      bucket: "recreio-fixture",
      assinatura: livro.assinatura,
      tempoLimiteMs: 2000,
    });
    await storage.iniciarCabecalho(livro.assinatura.assinarCabecalho(livro.inicial));
    const previa = await prepararEncerramentoNoBanco(
      autor,
      { pedidoId: randomUUID(), tipo: "encerrar_conta", perfis: [] },
      "dev",
    );
    const recibo = await consentirEncerramentoNoBanco(
      autor,
      {
        preparacaoId: previa.preparacaoId,
        planoSha256: previa.planoSha256,
        confirmoEncerramento: true,
        confirmoRetiradaDosPerfis: true,
        confirmoCancelamentoDaRenovacao: true,
      },
      { assinatura: livro.assinatura, fonte: "a".repeat(40), epoca: 0, modo: "dev" },
    );
    const publicado = await publicarProximoConsentimento({ assinatura: livro.assinatura, storage });
    if (publicado.situacao !== "admitida") throw new Error("Synthetic closure was not published");
    const coordenar = async () => ({
      assinatura: livro.assinatura,
      prova: await conferirPrefixoDoLivro({ storage, maxEntradas: 100, tempoLimiteMs: 5000 }),
    });
    const processar = criarProcessadorFinanceiroDoEncerramento({
      livroId: livro.livroId,
      obterCoordenacao: coordenar,
      obterRuntime,
    });
    return {
      ...livro,
      http,
      storage,
      recibo,
      previa,
      coordenar,
      processar,
      async devida() {
        await db
          .update(finances)
          .set({ nextAttemptAt: sql`clock_timestamp()` })
          .where(eq(finances.operationId, recibo.operacaoId));
      },
      async linha() {
        const [row] = await db
          .select()
          .from(finances)
          .where(eq(finances.operationId, recibo.operacaoId));
        if (!row) throw new Error("Synthetic closure finance absent");
        return row;
      },
      async fechar() {
        try {
          await http.fechar();
        } finally {
          livro.encerrar();
        }
      },
    };
  } catch (error) {
    try {
      await http.fechar();
    } finally {
      livro.encerrar();
    }
    throw error;
  }
}

type Pagamento = Awaited<ReturnType<typeof fixtureDePagamento>>;
/** The actual Stripe SDK talks only to this closed fixture. Metadata models
 * the native Checkout request; no provider interface is mocked or cast. */
export async function pagamentoParaEncerramento() {
  let payer = "",
    customer = "",
    unavailable = false,
    foreign = false;
  let remoto: ReturnType<Pagamento["concluirCheckout"]> | undefined;
  let depoisDoInventario: (() => Promise<void>) | undefined;
  const posts: string[] = [];
  const f: Pagamento = await fixtureDePagamento(
    false,
    "recreio_individual_monthly",
    async (request) => {
      const path = new URL(request.url).pathname;
      if (request.method === "GET" && path === `/v1/customers/${customer}`) {
        if (unavailable) throw new TypeError("Private synthetic provider unavailable");
        return Response.json({
          id: customer,
          object: "customer",
          livemode: false,
          balance: 0,
          metadata: { subject_type: "user", subject_id: foreign ? "foreign_payer" : payer },
        });
      }
      if (
        remoto &&
        request.method === "POST" &&
        path === `/v1/subscriptions/${remoto.assinatura.id}`
      ) {
        posts.push(await request.text());
        remoto.assinatura.cancel_at_period_end = true;
        return Response.json(remoto.assinatura);
      }
      if (request.method === "GET" && path === "/v1/checkout/sessions") {
        const sessions = f.sessions.map((s) => ({
          ...s,
          livemode: false,
          payment_status: s.status === "complete" && remoto?.pago ? "paid" : "unpaid",
          metadata: {
            ...s.metadata,
            subject_type: "user",
            subject_id: payer,
            product_id: f.entrada.productId,
          },
        }));
        await depoisDoInventario?.();
        return Response.json({ object: "list", data: sessions, has_more: false });
      }
      return null;
    },
  );
  payer = f.adulto.conta.id;
  customer = f.providerCustomerId;
  await criarExecutorDeCompra(() => f.runtime)(f.adulto.autor, f.recibo.id);
  const financeiro = f.concluirCheckout();
  remoto = financeiro;
  const conciliar = criarProcessadorDeConciliacao({
    modo: "dev",
    obterRuntime: () => f.runtimeFinanceiro,
    relatarFalha: () => {},
  });
  await conciliar();
  const inventario = createStripeRecreioClosureInventory({
    secretKey: "rk_test_closed_financial_inventory",
    mode: "dev",
    client: f.stripe,
  });
  const cancelar = criarProcessadorDeCancelamentoDaRenovacao({
    modo: "dev",
    obterRuntime: () => ({
      modo: "dev",
      renovacoes: createStripeRecreioRenewals({
        secretKey: "rk_test_closed_financial_renewal",
        mode: "dev",
        client: f.stripe,
      }),
    }),
    relatarFalha: () => {},
  });
  // Other disposable accounts retain their queue fixtures. Process due work
  // through the real worker; this transport cannot confirm a foreign contract.
  for (let n = 0; n < 64; n++) {
    if ((await cancelar()).reservadas === 0) break;
  }
  return {
    ...f,
    financeiro,
    inventario,
    cancelar,
    posts,
    indisponivel(value: boolean) {
      unavailable = value;
    },
    outroPagante(value: boolean) {
      foreign = value;
    },
    aposInventario(callback: () => Promise<void>) {
      depoisDoInventario = callback;
    },
  };
}
