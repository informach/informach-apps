import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";
import Stripe from "stripe";
import { fecharAparelhos, hidratado, novaPessoa } from "./apoio";

const banco = postgres(process.env.DATABASE_URL ?? "", { max: 1 });
const key = process.env.STRIPE_SECRET_KEY;
if (process.env.GITHUB_ACTIONS !== "true" || !key || !/^(sk|rk)_test_/.test(key))
  throw new Error("Real Stripe journey requires the isolated GitHub test key");
const stripe = new Stripe(key, {
  apiVersion: "2026-04-22.dahlia",
  timeout: 10_000,
  maxNetworkRetries: 0,
});
const origin = `http://localhost:${process.env.RECREIO_E2E_PORT}`;

async function conciliar() {
  const resposta = await fetch(`${origin}/api/jobs/conciliacao`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    signal: AbortSignal.timeout(180_000),
  });
  if (!resposta.ok) throw new Error(`Native financial job failed: HTTP ${resposta.status}`);
}

async function preencher(page: Page, selector: string, value: string, required = true) {
  for (const frame of page.frames()) {
    const campo = frame.locator(selector).first();
    if (await campo.isVisible().catch(() => false)) {
      await campo.fill(value);
      return;
    }
  }
  if (required) throw new Error(`Hosted test payment field absent: ${selector}`);
}

test.afterAll(async () => {
  await fecharAparelhos();
  await banco.end();
});

test("Checkout real, webhook encaminhado, pagamento conciliado e SDK sem Morada", async ({
  browser,
}) => {
  const conta = await stripe.accounts.retrieve(process.env.STRIPE_EXPECTED_ACCOUNT ?? "");
  expect(conta.id).toBe(process.env.STRIPE_EXPECTED_ACCOUNT);
  const a = await novaPessoa(browser, "Homologação Stripe", { semPerfil: true });
  const mascaradas = new Set<string>();
  const mascarar = (value: string) => {
    if (
      /^https:\/\/(checkout|billing|invoice)\.stripe\.com\//.test(value) &&
      !mascaradas.has(value)
    ) {
      mascaradas.add(value);
      console.log(`::add-mask::${value}`);
    }
  };
  a.contexto.on("request", (request) => {
    if (request.isNavigationRequest()) mascarar(request.url());
  });
  a.page.on("framenavigated", (frame) => mascarar(frame.url()));
  let clienteId: string | undefined, subscriptionId: string | undefined;
  let comprovante: Record<string, unknown> | undefined;
  let cancelada = false;
  let falha: unknown;
  const testSubscriptionIds: string[] = [];
  try {
    await a.page.goto("/conta/assinatura");
    const form = a.page.getByRole("form", { name: "Conferir e autorizar uma oferta", exact: true });
    await form.locator('input[type="radio"][value="recreio_individual_monthly"]').check();
    await form.getByRole("checkbox", { name: /Declaro ter 18 anos/ }).check();
    await form.getByRole("checkbox", { name: /Conferi o plano, o valor e o período/ }).check();
    const registrar = form.getByRole("button", {
      name: "Registrar autorização de compra",
      exact: true,
    });
    await hidratado(registrar);
    await Promise.all([a.page.waitForEvent("domcontentloaded"), registrar.click()]);
    const continuar = a.page.getByRole("button", {
      name: "Continuar no ambiente de teste",
      exact: true,
    });
    await hidratado(continuar);
    await continuar.click();
    await a.page.waitForURL((url) => url.hostname === "checkout.stripe.com", { timeout: 90_000 });
    const [cliente] =
      await banco`select c.provider_customer_id from billing.customers c join core.users u on u.id=c.subject_id
      where c.app='recreio' and c.subject_type='user' and c.provider='stripe' and u.email=${a.email}`;
    if (!cliente || typeof cliente.provider_customer_id !== "string")
      throw new Error("Native Checkout customer absent");
    clienteId = cliente.provider_customer_id;
    const remoto = await stripe.customers.retrieve(clienteId);
    if (remoto.deleted || remoto.livemode)
      throw new Error("Payment customer is not the isolated test customer");
    await stripe.customers.update(clienteId, {
      metadata: { recreio_homologacao_run: process.env.GITHUB_RUN_ID ?? "unknown" },
    });
    await preencher(
      a.page,
      'input[name="cardNumber"], input[autocomplete="cc-number"]',
      "4242424242424242",
    );
    await preencher(a.page, 'input[name="cardExpiry"], input[autocomplete="cc-exp"]', "1240");
    await preencher(a.page, 'input[name="cardCvc"], input[autocomplete="cc-csc"]', "123");
    await preencher(
      a.page,
      'input[name="billingName"], input[autocomplete="cc-name"]',
      "Recreio Sandbox",
      false,
    );
    await preencher(
      a.page,
      'input[name="billingPostalCode"], input[autocomplete="postal-code"]',
      "94107",
      false,
    );
    await a.page.getByRole("button", { name: /^(Subscribe|Pay|Assinar|Pagar)(\s|$)/i }).click();
    await a.page.waitForURL(
      (url) => url.origin === origin && url.pathname === "/conta/assinatura",
      { timeout: 120_000 },
    );
    await expect
      .poll(
        async () => {
          const [recibo] = await banco`select count(*)::integer as total from billing.webhook_events
        where app='recreio' and provider_customer_id=${clienteId} and provider_event_id like 'recreio-native:dev:%'
          and event_type in ('invoice.paid','checkout.session.completed') and processed_at is not null`;
          return recibo?.total ?? 0;
        },
        { timeout: 90_000, intervals: [1000, 2000, 5000] },
      )
      .toBeGreaterThan(0);
    await expect
      .poll(
        async () => {
          await conciliar();
          const [pedido] =
            await banco`select p.resolution from recreio.purchase_authorizations p join core.users u on u.id=p.payer_user_id where u.email=${a.email}`;
          return pedido?.resolution;
        },
        { timeout: 360_000, intervals: [2000, 5000, 10000] },
      )
      .toBe("checkout_completed");
    await a.page.reload();
    await expect(
      a.page.getByText("Pagamento confirmado. Acesso disponível aos perfis cobertos.", {
        exact: true,
      }),
    ).toBeVisible();
    const [fatos] =
      await banco`select s.provider_subscription_id, s.product_id, pp.provider_invoice_id,
      (select count(*)::integer from recreio.entitlements e where e.group_id=g.id) as concessoes
      from core.users u join recreio.groups g on g.owner_user_id=u.id
      join billing.customers c on c.subject_id=u.id and c.app='recreio' and c.subject_type='user'
      join billing.subscriptions s on s.customer_id=c.id
      join billing.subscription_payment_periods pp on pp.subscription_id=s.id where u.email=${a.email}`;
    if (!fatos || typeof fatos.provider_subscription_id !== "string")
      throw new Error("Actual paid contract was not persisted");
    subscriptionId = fatos.provider_subscription_id;
    expect(fatos.concessoes).toBe(0);
    const invoice = await stripe.invoices.retrieve(fatos.provider_invoice_id);
    expect(invoice.livemode).toBe(false);
    expect(invoice.status).toBe("paid");
    expect(invoice.amount_paid).toBe(5990);
    expect(invoice.currency).toBe("brl");
    await a.page.goto("/comecar");
    const apelido = a.page.getByLabel("Apelido");
    await hidratado(apelido);
    await apelido.fill("Jogador Sandbox");
    await a.page.getByRole("button", { name: "Criar perfil", exact: true }).click();
    await expect(a.page).toHaveURL(/\/estante$/);
    await a.page.goto("/jogar/perfil-teste");
    await expect(a.page.getByRole("button", { name: "Ganhar ponto" })).toBeEnabled();
    await a.page.getByRole("button", { name: "Ganhar ponto" }).click();
    await expect(a.page.getByRole("status", { name: "Estado do progresso" })).toContainText(
      "Progresso salvo",
    );
    await a.page.getByRole("button", { name: "Salvar e sair" }).click();
    await expect(a.page).toHaveURL(/\/estante$/);
    await a.page.goto("/jogar/perfil-teste");
    await expect(a.page.getByLabel("Pontos salvos")).toHaveText("1");
    await a.page.getByRole("button", { name: "Salvar e sair" }).click();
    const eventos = await banco`select event_type,provider_event_id from billing.webhook_events
      where app='recreio' and provider_customer_id=${clienteId} and processed_at is not null order by created_at`;
    comprovante = {
      source: process.env.GITHUB_SHA,
      workflowRunId: process.env.GITHUB_RUN_ID,
      verifiedAt: new Date().toISOString(),
      accountId: conta.id,
      mode: "dev",
      customerId: clienteId,
      subscriptionId,
      invoiceId: invoice.id,
      amountPaid: invoice.amount_paid,
      currency: invoice.currency,
      nativePurchaseCompleted: true,
      webhookDelivery: "stripe_cli_forwarded",
      providerEvents: eventos.map((e) => ({ type: e.event_type, receiptKey: e.provider_event_id })),
      game: "internal_profile_sdk_fixture",
      courtesyGrants: 0,
      paidSidAndProgressReopened: true,
    };
  } catch (error) {
    falha = error;
    // Attribute names only: no form values, DOM dumps, financial URLs or secrets.
    const fields: unknown[] = [];
    for (const frame of a.page.frames()) {
      const nomes = await frame
        .locator("input")
        .evaluateAll((inputs) =>
          inputs.map((input) => ({
            name: input.getAttribute("name"),
            type: input.getAttribute("type"),
            label: input.getAttribute("aria-label"),
          })),
        )
        .catch(() => []);
      fields.push(...nomes);
    }
    await writeFile(
      resolve(process.env.RUNNER_TEMP ?? "", "recreio-stripe-journey-diagnostic.json"),
      JSON.stringify({ status: "failed", fields }, null, 2),
    ).catch(() => {
      /* Preserve the journey failure if diagnostic storage fails. */
    });
  }
  try {
    // Cancel only this native synthetic customer's test contracts, including a
    // response lost before projection. Preserve provider receipts for inspection.
    const [local] =
      await banco`select c.provider_customer_id from billing.customers c join core.users u on u.id=c.subject_id
      where c.app='recreio' and c.subject_type='user' and c.provider='stripe' and u.email=${a.email}`;
    const customerId = clienteId ?? local?.provider_customer_id;
    if (typeof customerId === "string") {
      clienteId = customerId;
      const contracts: Stripe.Subscription[] = [];
      for await (const subscription of stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 100,
      })) {
        if (contracts.length >= 20 || subscription.livemode)
          throw new Error("Sandbox cleanup scope is invalid");
        contracts.push(subscription);
      }
      testSubscriptionIds.push(...contracts.map((subscription) => subscription.id));
      for (const subscription of contracts) {
        if (!["canceled", "incomplete_expired"].includes(subscription.status)) {
          const canceled = await stripe.subscriptions.cancel(subscription.id);
          if (canceled.status !== "canceled" || canceled.livemode)
            throw new Error("Sandbox cancellation was not confirmed");
        }
      }
      cancelada = true;
    }
  } catch (cleanup) {
    falha = falha
      ? new AggregateError([falha, cleanup], "Sandbox journey and cleanup failed")
      : cleanup;
  }
  if (!cancelada && !falha) falha = new Error("Sandbox cleanup was not confirmed");
  await a.contexto.close();
  await writeFile(
    resolve(process.env.RUNNER_TEMP ?? "", "recreio-stripe-journey.json"),
    `${JSON.stringify({ source: process.env.GITHUB_SHA, workflowRunId: process.env.GITHUB_RUN_ID, mode: "dev", ...comprovante, customerId: clienteId ?? null, testSubscriptionIds, status: falha ? "failed" : "passed", failureType: falha instanceof Error ? falha.name : null, testSubscriptionsCanceled: cancelada }, null, 2)}\n`,
  );
  if (falha) throw falha;
});
