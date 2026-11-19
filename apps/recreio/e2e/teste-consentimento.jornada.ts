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

/** Somente leitura da conta sintética, no banco descartável exigido pelo config. */
async function fatos(email: string) {
  const [linha] = await banco<
    {
      perfis: number;
      concessoes: number;
      sessoes: number;
      claims: number;
      consentimentos: number;
      ativos: number;
    }[]
  >`
    select
      (select count(*)::integer from recreio.profiles p where p.group_id=g.id) as perfis,
      (select count(*)::integer from recreio.entitlements e where e.group_id=g.id) as concessoes,
      (select count(*)::integer from recreio.game_sessions s
        join recreio.profiles p on p.id=s.profile_id where p.group_id=g.id) as sessoes,
      (select count(*)::integer from recreio.trial_claims c where c.payer_user_id=u.id) as claims,
      (select count(*)::integer from recreio.trial_enrollments e where e.payer_user_id=u.id) as consentimentos,
      (select count(*)::integer from recreio.trial_enrollments e
        where e.payer_user_id=u.id and e.withdrawn_at is null) as ativos
    from core.users u left join recreio.groups g on g.owner_user_id=u.id where u.email=${email}
  `;
  expect(linha).toBeDefined();
  return linha;
}

test("adulto sem jogador autoriza, confere após recarga e retira; outra conta não herda recibo", async ({
  browser,
}) => {
  const a = await novaPessoa(browser, "Ana", { semPerfil: true });
  await a.page.goto("/conta");
  await a.page.getByRole("link", { name: "Gerenciar teste gratuito", exact: true }).click();
  await expect(a.page).toHaveURL(/\/conta\/teste$/);
  await a.page.setViewportSize({ width: 390, height: 844 });
  const formulario = a.page.getByRole("form", { name: "Autorizar o teste gratuito", exact: true });
  const enviar = formulario.getByRole("button", { name: "Registrar autorização", exact: true });
  const adulto = formulario.getByRole("checkbox", { name: /Declaro ter 18 anos/ });
  await hidratado(adulto);
  await expect(enviar).toBeDisabled();
  await adulto.check();
  await expect(enviar).toBeDisabled();
  await formulario.getByRole("checkbox", { name: /Entendi as duas durações/ }).check();
  await expect(enviar).toBeEnabled();
  expect(
    await a.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await tela(a.page, "teste-consentimento-mobile");
  await Promise.all([a.page.waitForEvent("domcontentloaded"), enviar.click()]);
  const recibo = a.page.getByRole("region", { name: "Sua autorização", exact: true });
  await expect(recibo.getByText("Autorização registrada.", { exact: true })).toBeVisible();
  await expect(
    recibo.getByText("O prazo do teste ainda não começou.", { exact: true }),
  ).toBeVisible();
  await expect(formulario).toHaveCount(0);
  await a.page.reload();
  await expect(recibo.getByText("Autorização registrada.", { exact: true })).toBeVisible();
  expect(await fatos(a.email)).toEqual({
    perfis: 0,
    concessoes: 0,
    sessoes: 0,
    claims: 0,
    consentimentos: 1,
    ativos: 1,
  });
  await tela(a.page, "teste-recibo-mobile");

  const b = await novaPessoa(browser, "Bruno", { semPerfil: true });
  await b.page.goto("/conta/teste");
  await expect(b.page.getByRole("region", { name: "Sua autorização", exact: true })).toHaveCount(0);
  await expect(
    b.page.getByRole("form", { name: "Autorizar o teste gratuito", exact: true }),
  ).toBeVisible();
  expect(await fatos(b.email)).toEqual({
    perfis: 0,
    concessoes: 0,
    sessoes: 0,
    claims: 0,
    consentimentos: 0,
    ativos: 0,
  });

  const retirar = recibo.getByRole("button", { name: "Retirar autorização do teste", exact: true });
  await hidratado(retirar);
  await Promise.all([a.page.waitForEvent("domcontentloaded"), retirar.click()]);
  await expect(recibo.getByText("Autorização retirada.", { exact: true })).toBeVisible();
  await expect(retirar).toHaveCount(0);
  await a.page.reload();
  await expect(recibo.getByText("Autorização retirada.", { exact: true })).toBeVisible();
  expect(await fatos(a.email)).toEqual({
    perfis: 0,
    concessoes: 0,
    sessoes: 0,
    claims: 0,
    consentimentos: 1,
    ativos: 0,
  });
});
