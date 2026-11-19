import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";
import { VERSAO_DO_FINANCIAMENTO } from "../src/features/cobranca/financiamento-regras";
import { VERSAO_DA_TROCA } from "../src/features/cobranca/troca-entrada";
import { comecarVigia, fecharAparelhos, hidratado, novaPessoa, tela, vigia } from "./apoio";

const banco = postgres(process.env.DATABASE_URL ?? "", { max: 1 });
test.beforeEach(comecarVigia);
test.afterEach(async () => {
  await fecharAparelhos();
  expect(vigia()).toEqual({ violacoes: [], errosDePagina: [], errosDeConsole: [] });
});
test.afterAll(() => banco.end());

test("cancelamento nativo sem jogador exige aceite e distingue recebimento de confirmação", async ({
  browser,
}) => {
  const a = await novaPessoa(browser, "Ana", { semPerfil: true });
  await a.page.goto("/conta/assinatura");
  await expect(a.page.getByRole("region", { name: "Cancelar renovação", exact: true })).toHaveCount(
    0,
  );
  const origem = await prepararContrato(a.page, a.email);
  await a.page.setViewportSize({ width: 390, height: 844 });
  const regiao = a.page.getByRole("region", { name: "Cancelar renovação", exact: true });
  const confirmar = regiao.getByRole("button", {
    name: "Confirmar cancelamento da renovação",
    exact: true,
  });
  await hidratado(confirmar);
  await expect(confirmar).toBeDisabled();
  await regiao
    .getByRole("checkbox", { name: /Quero cancelar a renovação desta assinatura/ })
    .check();
  await expect(confirmar).toBeEnabled();
  await regiao.scrollIntoViewIfNeeded();
  await tela(a.page, "renovacao-aceite-mobile", { paginaInteira: true });
  await confirmar.click();
  await expect(
    regiao.getByText("Pedido recebido. A interrupção da renovação ainda aguarda confirmação.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(confirmar).toHaveCount(0);
  await expect(a.page.getByRole("heading", { name: "Troca de plano", exact: true })).toHaveCount(0);
  const [recibo] =
    await banco`select id,state,attempts,request_started_at,confirmed_at,accepted_at from recreio.renewal_cancellations where payer_user_id=${origem.payer_user_id}`;
  if (!recibo) throw new Error("Native UI renewal receipt absent");
  expect(recibo).toMatchObject({
    state: "accepted",
    attempts: 0,
    request_started_at: null,
    confirmed_at: null,
  });
  await Promise.all([
    a.page.waitForEvent("load"),
    regiao.getByRole("button", { name: "Conferir pedido de cancelamento", exact: true }).click(),
  ]);
  await expect(regiao.getByRole("status")).toHaveText(
    "Pedido recebido. A interrupção da renovação ainda aguarda confirmação.",
  );
  const [auditoria] =
    await banco`select count(*)::integer as total from audit.events where event_type='recreio.renewal_cancellation_accepted' and payload->>'cancellationId'=${recibo.id}`;
  expect(auditoria?.total).toBe(1);
  // Structural rendering fixtures only. Provider confirmation is exercised by
  // the separate native PostgreSQL/SDK suite; no HTTP payment occurs here.
  await banco`update recreio.renewal_cancellations set state='attempted',attempts=1,request_started_at=statement_timestamp(),updated_at=statement_timestamp() where id=${recibo.id}`;
  await a.page.reload();
  await expect(regiao.getByText(/Cancelamento em processamento/)).toBeVisible();
  await banco`update recreio.renewal_cancellations set state='review',review_code='provider_unavailable',updated_at=statement_timestamp() where id=${recibo.id}`;
  await a.page.reload();
  await expect(regiao.getByText(/precisa de conferência/)).toBeVisible();
  await regiao.scrollIntoViewIfNeeded();
  await tela(a.page, "renovacao-conferencia-mobile", { paginaInteira: true });
  await banco`update recreio.renewal_cancellations set state='confirmed',review_code=null,provider_result='scheduled',provider_stop_at=expected_period_end,observation_sha256=${"0".repeat(64)},observed_at=statement_timestamp(),confirmed_at=statement_timestamp(),updated_at=statement_timestamp() where id=${recibo.id}`;
  await a.page.reload();
  await expect(
    regiao.getByText("Interrupção da renovação confirmada.", { exact: true }),
  ).toBeVisible();
  await regiao.scrollIntoViewIfNeeded();
  await tela(a.page, "renovacao-confirmada-mobile", { paginaInteira: true });
  const [contrato] =
    await banco`select current_product_id,revision from recreio.billing_contracts where purchase_id=${origem.id}`;
  expect(contrato).toMatchObject({ current_product_id: "recreio_family_monthly", revision: 1 });
  const [perfis] =
    await banco`select count(*)::integer as total from recreio.profiles where group_id=${origem.group_id}`;
  expect(perfis?.total).toBe(0);
  const largura = await a.page.evaluate(() => ({
    tela: innerWidth,
    pagina: document.documentElement.scrollWidth,
  }));
  expect(largura.pagina).toBeLessThanOrEqual(largura.tela);
  const b = await novaPessoa(browser, "Beto", { semPerfil: true });
  await b.page.goto("/conta/assinatura");
  await expect(b.page.getByRole("region", { name: "Cancelar renovação", exact: true })).toHaveCount(
    0,
  );
});

async function cadastrarMenores(page: Page) {
  await page.goto("/conta/perfis");
  for (const nome of ["Luar", "Maré"]) {
    const adicionar = page.getByRole("button", { name: "Adicionar perfil", exact: true });
    await hidratado(adicionar);
    await adicionar.click();
    await hidratado(page.getByLabel("Apelido", { exact: true }));
    await page.getByLabel("Apelido", { exact: true }).fill(nome);
    await page.getByLabel("Mês de nascimento", { exact: true }).selectOption("1");
    await page
      .getByLabel("Ano de nascimento", { exact: true })
      .fill(String(new Date().getUTCFullYear() - 8));
    await page.getByRole("checkbox", { name: /Declaro que tenho 18/ }).check();
    await page.getByRole("button", { name: "Confirmar cadastro", exact: true }).click();
    await expect(page.getByRole("heading", { name: nome, exact: true })).toBeVisible();
  }
}

/** Existing paid authority is a declared SQL fixture, not a provider payment.
 * The browser performs native quote/accept/close; it never sends a Stripe call. */
async function prepararContrato(
  page: Page,
  email: string,
  plano: "family_monthly" | "individual_annual" = "family_monthly",
) {
  const produtoId = `recreio_${plano}`,
    preco = `price_${produtoId}`;
  await page.goto("/conta/assinatura");
  const form = page.getByRole("form", { name: "Conferir e autorizar uma oferta", exact: true });
  await hidratado(
    form.getByRole("button", { name: "Registrar autorização de compra", exact: true }),
  );
  await form
    .getByRole("radio", {
      name: plano === "family_monthly" ? /Recreio Família.*por mês/ : /Recreio Individual anual/,
    })
    .check();
  await form.getByRole("checkbox", { name: /Declaro ter 18 anos/ }).check();
  await form.getByRole("checkbox", { name: /Conferi o plano, o valor e o período/ }).check();
  await form.getByRole("button", { name: "Registrar autorização de compra", exact: true }).click();
  await expect(page.getByRole("region", { name: "Seu pedido", exact: true })).toBeVisible();
  const [pedido] =
    await banco`select p.id,p.payer_user_id,p.group_id from recreio.purchase_authorizations p
    join core.users u on u.id=p.payer_user_id where u.email=${email} and p.resolved_at is null`;
  if (!pedido) throw new Error("Native family purchase absent");
  const sufixo = randomUUID().replaceAll("-", ""),
    agora = new Date(),
    inicio = new Date(agora.getTime() - 86400_000),
    fim = new Date(agora.getTime() + 30 * 86400_000);
  await banco.begin(async (tx) => {
    const [cliente] =
      await tx`insert into billing.customers (provider,app,subject_type,subject_id,email,provider_customer_id)
      values ('stripe','recreio','user',${pedido.payer_user_id},${email},${`cus_plans_ui_${sufixo}`}) returning id`;
    if (!cliente) throw new Error("Synthetic customer absent");
    const [sub] =
      await tx`insert into billing.subscriptions (customer_id,provider,provider_subscription_id,provider_price_id,product_id,status,current_period_start,current_period_end,provider_observed_at)
      values (${cliente.id},'stripe',${`sub_plans_ui_${sufixo}`},${preco},${produtoId},'active',${inicio},${fim},${agora}) returning id`;
    if (!sub) throw new Error("Synthetic subscription absent");
    await tx`update recreio.purchase_authorizations set request_started_at=accepted_at,provider_session_id=${`cs_plans_ui_${sufixo}`},provider_subscription_id=${`sub_plans_ui_${sufixo}`},resolved_at=${agora},resolution='checkout_completed',review_required=false where id=${pedido.id}`;
    await tx`insert into recreio.billing_contracts (subscription_id,purchase_id,group_id,payer_user_id,provider_mode,origin_product_id,origin_price_id,current_product_id,current_price_id,purchase_selection_processed_at)
      values (${sub.id},${pedido.id},${pedido.group_id},${pedido.payer_user_id},'dev',${produtoId},${preco},${produtoId},${preco},${agora})`;
    const [periodo] =
      await tx`insert into billing.subscription_payment_periods (subscription_id,provider,provider_invoice_id,provider_line_id,provider_price_id,period_start,period_end,paid_at,reconciled_at)
      values (${sub.id},'stripe',${`in_plans_ui_${sufixo}`},${`il_plans_ui_${sufixo}`},${preco},${inicio},${fim},${new Date(agora.getTime() - 60_000)},${agora}) returning id`;
    if (!periodo) throw new Error("Synthetic payment period absent");
    const [prova] =
      await tx`insert into recreio.funding_observations (payment_period_id,subscription_id,provider,purchase_id,group_id,payer_user_id,provider_mode,origin_product_id,funding_status,funded_until,policy_version,evidence_hash,first_observed_at)
      values (${periodo.id},${sub.id},'stripe',${pedido.id},${pedido.group_id},${pedido.payer_user_id},'dev',${produtoId},'verified',${fim},${VERSAO_DO_FINANCIAMENTO},${"0".repeat(64)},${agora}) returning id`;
    if (!prova) throw new Error("Synthetic funding authority absent");
    await tx`insert into recreio.payment_funding (payment_period_id,observation_id,observed_at) values (${periodo.id},${prova.id},${agora})`;
    await tx`insert into recreio.billing_reconciliations (payer_user_id,group_id,provider_mode,last_attempt_at,last_confirmed_at,attempt_count,review_required,review_reason,next_attempt_at,created_at,updated_at)
      values (${pedido.payer_user_id},${pedido.group_id},'dev',${agora},${agora},1,false,null,${new Date(agora.getTime() + 300_000)},${agora},${agora})`;
    await tx`update recreio.profiles set coverage_enabled=true where group_id=${pedido.group_id} and status='active'`;
  });
  await page.reload();
  await page.goto("/conta/assinatura#troca-de-plano");
  return pedido;
}

test("redução preserva seleção não inicial, mostra cotação e exige aceite separado; encerramento mantém perfis", async ({
  browser,
}) => {
  const a = await novaPessoa(browser, "Ana", { semPerfil: true });
  await cadastrarMenores(a.page);
  const origem = await prepararContrato(a.page, a.email);
  await a.page.setViewportSize({ width: 390, height: 844 });
  const form = a.page.getByRole("form", { name: "Preparar troca de plano", exact: true });
  const conferir = form.getByRole("button", { name: "Conferir condições da troca", exact: true });
  await hidratado(conferir);
  await expect(form.getByRole("radio")).toHaveCount(3);
  await form.getByRole("radio", { name: /Recreio Individual.*por mês/ }).check();
  await expect(conferir).toBeDisabled();
  await form.getByRole("checkbox", { name: "Luar", exact: true }).uncheck();
  await expect(form.getByRole("checkbox", { name: "Maré", exact: true })).toBeChecked();
  await expect(conferir).toBeEnabled();
  await conferir.click();
  const recibo = a.page.getByRole("region", { name: "Pedido de troca", exact: true });
  await expect(recibo.getByText("Cotação pronta para conferir", { exact: true })).toBeVisible();
  await expect(recibo.getByText(/59,90 por mês/)).toBeVisible();
  await expect(recibo.getByText(/Seleção registrada: Maré/)).toBeVisible();
  const [cotacao] =
    await banco`select id,status,accepted_at,request_started_at from recreio.plan_changes where payer_user_id=${origem.payer_user_id} and resolved_at is null`;
  if (!cotacao) throw new Error("Native UI quote absent");
  expect(cotacao.status).toBe("quoted");
  expect(cotacao.accepted_at).toBeNull();
  expect(cotacao.request_started_at).toBeNull();
  const escolhidos =
    await banco`select p.nickname from recreio.plan_change_profiles s join recreio.profiles p on p.id=s.profile_id where s.plan_change_id=${cotacao.id} and s.coverage_enabled=true`;
  expect(escolhidos.map((p) => p.nickname)).toEqual(["Maré"]);
  const autorizar = recibo.getByRole("button", {
    name: "Registrar autorização da troca",
    exact: true,
  });
  await expect(autorizar).toBeDisabled();
  await a.page
    .getByRole("heading", { name: "Troca de plano", exact: true })
    .scrollIntoViewIfNeeded();
  await tela(a.page, "troca-cotacao-mobile", { paginaInteira: true });
  await recibo
    .getByRole("checkbox", { name: /Conferi os valores, a vigência e os jogadores/ })
    .check();
  await expect(autorizar).toBeEnabled();
  await autorizar.click();
  await expect(
    recibo.getByText("Troca autorizada e ainda não enviada", { exact: true }),
  ).toBeVisible();
  await expect(recibo.getByRole("button", { name: "Agendar redução", exact: true })).toBeEnabled();
  await tela(a.page, "troca-autorizada-mobile", { paginaInteira: true });
  const [aceita] =
    await banco`select status,accepted_at,request_started_at from recreio.plan_changes where id=${cotacao.id}`;
  expect(aceita?.status).toBe("accepted");
  expect(aceita?.accepted_at).toBeInstanceOf(Date);
  expect(aceita?.request_started_at).toBeNull();
  await recibo.getByRole("button", { name: "Encerrar pedido sem envio", exact: true }).click();
  await expect(recibo.getByText("Pedido de troca encerrado", { exact: true })).toBeVisible();
  const [contrato] =
    await banco`select current_product_id,revision from recreio.billing_contracts where purchase_id=${origem.id}`;
  expect(contrato).toMatchObject({ current_product_id: "recreio_family_monthly", revision: 1 });
  const perfis =
    await banco`select nickname,coverage_enabled from recreio.profiles where group_id=${origem.group_id} order by created_at,id`;
  expect(perfis.map((p) => p.nickname)).toEqual(["Luar", "Maré"]);
  expect(perfis.every((p) => p.coverage_enabled)).toBe(true);
  const largura = await a.page.evaluate(() => ({
    tela: innerWidth,
    pagina: document.documentElement.scrollWidth,
  }));
  expect(largura.pagina).toBeLessThanOrEqual(largura.tela);
  const b = await novaPessoa(browser, "Beto", { semPerfil: true });
  await b.page.goto("/conta/assinatura");
  await expect(b.page.getByRole("heading", { name: "Troca de plano", exact: true })).toHaveCount(0);
  await expect(b.page.getByText("Maré", { exact: true })).toHaveCount(0);
});

test("crédito anual exibe total negativo e cobrança zero sem enviar; pagante não precisa de jogador", async ({
  browser,
}) => {
  const a = await novaPessoa(browser, "Ana", { semPerfil: true });
  const origem = await prepararContrato(a.page, a.email, "individual_annual");
  const cotacaoId = randomUUID();
  // Presentation-only quote fixture. Native preview/financial provenance and
  // external API money have their own gates; this tests displayed/accepted terms.
  await banco.begin(async (tx) => {
    const [c] =
      await tx`select c.subscription_id,c.origin_product_id,c.current_price_id,s.current_period_start,s.current_period_end from recreio.billing_contracts c join billing.subscriptions s on s.id=c.subscription_id where c.purchase_id=${origem.id}`;
    if (!c) throw new Error("Synthetic annual contract absent");
    const agora = new Date(),
      proporcional = new Date(Math.floor(agora.getTime() / 1000) * 1000);
    await tx`insert into recreio.plan_changes (id,subscription_id,purchase_id,group_id,payer_user_id,provider_mode,origin_product_id,expected_contract_revision,from_product_id,from_price_id,to_product_id,to_price_id,to_amount_cents,to_interval,kind,period_start,period_end,effective_at,proration_at,provider_item_id,quoted_amount_cents,quoted_subtotal_cents,quoted_credit_cents,quoted_total_cents,quoted_starting_balance_cents,currency,policy_version,quoted_at,quote_expires_at,status)
      values (${cotacaoId},${c.subscription_id},${origem.id},${origem.group_id},${origem.payer_user_id},'dev',${c.origin_product_id},1,'recreio_individual_annual',${c.current_price_id},'recreio_family_monthly','price_recreio_family_monthly',12790,'month','upgrade',${c.current_period_start},${c.current_period_end},${proporcional},${proporcional},'si_annual_ui_fixture',0,12790,-59900,-47110,0,'BRL',${VERSAO_DA_TROCA},${agora},${new Date(agora.getTime() + 300_000)},'quoted')`;
  });
  await a.page.setViewportSize({ width: 390, height: 844 });
  await a.page.reload();
  await a.page.goto("/conta/assinatura#troca-de-plano");
  const recibo = a.page.getByRole("region", { name: "Pedido de troca", exact: true });
  await expect(recibo.getByText("Cotação pronta para conferir", { exact: true })).toBeVisible();
  await expect(recibo.getByText(/-.*599,00/)).toBeVisible();
  await expect(recibo.getByText(/-.*471,10/)).toBeVisible();
  await expect(
    recibo.getByText("Cobrança agora", { exact: true }).locator("xpath=following-sibling::dd[1]"),
  ).toHaveText(/0,00/);
  await expect(
    recibo.getByText(/Nenhum jogador. O pagante pode administrar sem jogar/),
  ).toBeVisible();
  await tela(a.page, "troca-credito-mobile", { paginaInteira: true });
  const aceitar = recibo.getByRole("button", {
    name: "Registrar autorização da troca",
    exact: true,
  });
  await hidratado(aceitar);
  await expect(aceitar).toBeDisabled();
  await recibo
    .getByRole("checkbox", { name: /Conferi os valores, a vigência e os jogadores/ })
    .check();
  await aceitar.click();
  await expect(
    recibo.getByText("Troca autorizada e ainda não enviada", { exact: true }),
  ).toBeVisible();
  await expect(
    recibo.getByRole("button", { name: "Enviar aumento agora", exact: true }),
  ).toBeEnabled();
  const [aceita] =
    await banco`select status,accepted_at,request_started_at,quoted_amount_cents,quoted_total_cents from recreio.plan_changes where id=${cotacaoId}`;
  expect(aceita).toMatchObject({
    status: "accepted",
    request_started_at: null,
    quoted_amount_cents: 0,
    quoted_total_cents: -47110,
  });
  expect(aceita?.accepted_at).toBeInstanceOf(Date);
  const [perfis] =
    await banco`select count(*)::integer as total from recreio.profiles where group_id=${origem.group_id}`;
  expect(perfis?.total).toBe(0);
  const largura = await a.page.evaluate(() => ({
    tela: innerWidth,
    pagina: document.documentElement.scrollWidth,
  }));
  expect(largura.pagina).toBeLessThanOrEqual(largura.tela);
});
