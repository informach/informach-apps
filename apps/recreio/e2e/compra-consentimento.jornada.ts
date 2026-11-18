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
