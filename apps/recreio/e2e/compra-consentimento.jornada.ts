import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { comecarVigia, fecharAparelhos, hidratado, novaPessoa, tela, vigia } from "./apoio";

const banco = postgres(process.env.DATABASE_URL ?? "", { max: 1 });
test.beforeEach(comecarVigia);
test.afterEach(async () => {
  await fecharAparelhos();
  expect(vigia()).toEqual({ violacoes: [], errosDePagina: [], errosDeConsole: [] });
});
test.afterAll(() => banco.end());

async function fatos(email: string) {
  const [linha] = await banco`select
    (select count(*)::integer from recreio.profiles p where p.group_id=g.id) as perfis,
    (select count(*)::integer from billing.customers c where c.app='recreio' and c.subject_id=u.id::text) as clientes,
    (select count(*)::integer from recreio.entitlements e where e.group_id=g.id) as concessoes,
    (select count(*)::integer from recreio.purchase_authorizations p where p.payer_user_id=u.id) as pedidos,
    (select count(*)::integer from recreio.purchase_authorizations p where p.payer_user_id=u.id and p.request_started_at is not null) as envios
    from core.users u left join recreio.groups g on g.owner_user_id=u.id where u.email=${email}`;
  return linha;
}

test("adulto sem jogador confere quatro ofertas, autoriza, relê e encerra; outra conta não herda pedido", async ({
  browser,
}) => {
  const a = await novaPessoa(browser, "Ana", { semPerfil: true });
  await a.page.goto("/conta");
  await a.page.getByRole("link", { name: "Gerenciar assinatura", exact: true }).click();
  await expect(a.page).toHaveURL(/\/conta\/assinatura$/);
  await a.page.setViewportSize({ width: 390, height: 844 });
  const form = a.page.getByRole("form", { name: "Conferir e autorizar uma oferta", exact: true });
  const registrar = form.getByRole("button", {
    name: "Registrar autorização de compra",
    exact: true,
  });
  await hidratado(registrar);
  await expect(form.getByRole("radio")).toHaveCount(4);
  await expect(registrar).toBeDisabled();
  await form.getByRole("radio", { name: /Recreio Família anual/ }).check();
  await form.getByRole("checkbox", { name: /Declaro ter 18 anos/ }).check();
  await expect(registrar).toBeDisabled();
  const aceite = form.getByRole("checkbox", { name: /Conferi o plano, o valor e o período/ });
  await aceite.check();
  await expect(registrar).toBeEnabled();
  await form.getByRole("radio", { name: /Recreio Individual anual/ }).check();
  await expect(aceite).not.toBeChecked();
  await expect(registrar).toBeDisabled();
  await aceite.check();
  expect(
    await a.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await tela(a.page, "compra-ofertas-mobile");
  await Promise.all([a.page.waitForEvent("domcontentloaded"), registrar.click()]);
  const recibo = a.page.getByRole("region", { name: "Seu pedido", exact: true });
  await expect(
    recibo.getByText("Autorização registrada. Nenhuma compra foi enviada.", { exact: true }),
  ).toBeVisible();
  await expect(recibo.getByText("Recreio Individual anual", { exact: true })).toBeVisible();
  await expect(form).toHaveCount(0);
  await a.page.reload();
  await expect(recibo).toBeVisible();
  expect(await fatos(a.email)).toEqual({
    perfis: 0,
    clientes: 0,
    concessoes: 0,
    pedidos: 1,
    envios: 0,
  });
  await tela(a.page, "compra-recibo-mobile");
  const b = await novaPessoa(browser, "Bruno", { semPerfil: true });
  await b.page.goto("/conta/assinatura?retorno=1");
  await expect(b.page.getByRole("region", { name: "Seu pedido", exact: true })).toHaveCount(0);
  await expect(
    b.page.getByRole("form", { name: "Conferir e autorizar uma oferta", exact: true }),
  ).toBeVisible();
  expect(await fatos(b.email)).toEqual({
    perfis: 0,
    clientes: 0,
    concessoes: 0,
    pedidos: 0,
    envios: 0,
  });
  const encerrar = recibo.getByRole("button", { name: "Encerrar pedido não enviado", exact: true });
  await hidratado(encerrar);
  await Promise.all([a.page.waitForEvent("domcontentloaded"), encerrar.click()]);
  await expect(recibo.getByText("Pedido encerrado antes do envio.", { exact: true })).toBeVisible();
  await a.page.reload();
  await expect(recibo.getByText("Pedido encerrado antes do envio.", { exact: true })).toBeVisible();
  expect(await fatos(a.email)).toEqual({
    perfis: 0,
    clientes: 0,
    concessoes: 0,
    pedidos: 1,
    envios: 0,
  });
});

test("situação paga e revisão financeira aparecem ao pagante sem jogador", async ({ browser }) => {
  const a = await novaPessoa(browser, "Clara", { semPerfil: true });
  await a.page.goto("/conta/assinatura");
  await a.page.setViewportSize({ width: 390, height: 844 });
  const form = a.page.getByRole("form", { name: "Conferir e autorizar uma oferta", exact: true });
  await form.getByRole("radio", { name: /Recreio Individual mensal/ }).check();
  await form.getByRole("checkbox", { name: /Declaro ter 18 anos/ }).check();
  await form.getByRole("checkbox", { name: /Conferi o plano, o valor e o período/ }).check();
  const registrar = form.getByRole("button", {
    name: "Registrar autorização de compra",
    exact: true,
  });
  await hidratado(registrar);
  await Promise.all([a.page.waitForEvent("domcontentloaded"), registrar.click()]);
  const [pedido] =
    await banco`select p.id,p.payer_user_id,p.group_id from recreio.purchase_authorizations p
    join core.users u on u.id=p.payer_user_id where u.email=${a.email} and p.resolved_at is null`;
  if (!pedido) throw new Error("Native accepted purchase absent");
  const sufixo = randomUUID().replaceAll("-", ""),
    customer = `cus_ui_${sufixo}`,
    sub = `sub_ui_${sufixo}`;
  // Explicit SQL financial fixture for presentation only. Native provider/SDK
  // settlement and revocation have separate gates; no Stripe communication here.
  await banco.begin(async (tx) => {
    const [cliente] = await tx`insert into billing.customers
      (provider,app,subject_type,subject_id,email,provider_customer_id)
      values ('stripe','recreio','user',${pedido.payer_user_id},${a.email},${customer}) returning id`;
    if (!cliente) throw new Error("Synthetic customer absent");
    const [assinatura] = await tx`insert into billing.subscriptions
      (customer_id,provider,provider_subscription_id,provider_price_id,product_id,status,current_period_start,current_period_end,provider_observed_at)
      values (${cliente.id},'stripe',${sub},'price_ui_recreio','recreio_individual_monthly','active',
        clock_timestamp()-interval '1 day',clock_timestamp()+interval '30 days',clock_timestamp()) returning id,current_period_start,current_period_end`;
    if (!assinatura) throw new Error("Synthetic subscription absent");
    await tx`insert into billing.subscription_payment_periods
      (subscription_id,provider,provider_invoice_id,provider_line_id,provider_price_id,period_start,period_end,paid_at,reconciled_at)
      values (${assinatura.id},'stripe',${`in_ui_${sufixo}`},${`il_ui_${sufixo}`},'price_ui_recreio',
        ${assinatura.current_period_start},${assinatura.current_period_end},clock_timestamp()-interval '1 minute',clock_timestamp())`;
    await tx`update recreio.purchase_authorizations set request_started_at=clock_timestamp(),provider_session_id=${`cs_ui_${sufixo}`},
      provider_subscription_id=${sub},resolved_at=clock_timestamp(),resolution='checkout_completed',review_required=false where id=${pedido.id}`;
    await tx`insert into recreio.billing_reconciliations
      (payer_user_id,group_id,provider_mode,last_attempt_at,last_confirmed_at,attempt_count,review_required,review_reason,next_attempt_at)
      values (${pedido.payer_user_id},${pedido.group_id},'dev',clock_timestamp(),clock_timestamp(),1,false,null,clock_timestamp()+interval '5 minutes')`;
  });
  await a.page.reload();
  const situacao = a.page.getByRole("region", { name: "Situação da assinatura", exact: true });
  await expect(
    situacao.getByText("Pagamento confirmado. Acesso disponível aos perfis cobertos.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    a.page.getByRole("form", { name: "Conferir e autorizar uma oferta", exact: true }),
  ).toHaveCount(0);
  await expect(
    a.page.getByText("Pedido concluído. Confira acima a situação atual da assinatura.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await a.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await tela(a.page, "compra-paga-mobile");
  expect((await fatos(a.email))?.perfis).toBe(0);
  const b = await novaPessoa(browser, "Daniel", { semPerfil: true });
  await b.page.goto("/conta/assinatura");
  await expect(
    b.page.getByRole("region", { name: "Situação da assinatura", exact: true }),
  ).toHaveCount(0);
  await banco`update recreio.billing_reconciliations set review_required=true,review_reason='adverse_event',updated_at=clock_timestamp()
    where payer_user_id=${pedido.payer_user_id} and provider_mode='dev'`;
  await a.page.reload();
  await expect(
    situacao.getByText(
      "Pagamento em conferência. O acesso da assinatura está temporariamente indisponível.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    a.page.getByRole("form", { name: "Conferir e autorizar uma oferta", exact: true }),
  ).toHaveCount(0);
  await tela(a.page, "compra-conferencia-mobile");
});
