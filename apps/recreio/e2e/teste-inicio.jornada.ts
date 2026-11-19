import { expect, test } from "@playwright/test";
import postgres from "postgres";
import {
  comecarVigia,
  criarMundo,
  fecharAparelhos,
  hidratado,
  novaPessoa,
  tela,
  vigia,
} from "./apoio";
import { servidorDoContador } from "./servidor-apoio";

const banco = postgres(process.env.DATABASE_URL ?? "", { max: 1 });
const instancia = servidorDoContador();
test.beforeEach(comecarVigia);
test.afterEach(async () => {
  await fecharAparelhos();
  await instancia.parar();
  expect(vigia()).toEqual({ violacoes: [], errosDePagina: [], errosDeConsole: [] });
});
test.afterAll(() => banco.end());

async function contagens(email: string) {
  const [linha] = await banco<{ claims: number; concessoes: number }[]>`
    select
      (select count(*)::integer from recreio.trial_claims c where c.payer_user_id=u.id) as claims,
      (select count(*)::integer from recreio.entitlements e where e.group_id=g.id) as concessoes
    from core.users u join recreio.groups g on g.owner_user_id=u.id where u.email=${email}
  `;
  return linha;
}
async function periodo(email: string) {
  const [linha] = await banco<{ coorte: "48h" | "7d"; inicio: Date; fim: Date }[]>`
    select c.cohort as coorte, c.starts_at as inicio, c.ends_at as fim
    from recreio.trial_claims c join core.users u on u.id=c.payer_user_id where u.email=${email}
  `;
  if (!linha) throw new Error("Primeira sessão não registrou o teste");
  return linha;
}

test("autoriza, prepara mundo sem prazo, joga pela SID real, salva e reabre sem reiniciar o teste", async ({
  browser,
}) => {
  const a = await novaPessoa(browser, "Ana", { comAcesso: false });
  await a.page.goto("/conta/teste");
  const formulario = a.page.getByRole("form", { name: "Autorizar o teste gratuito", exact: true });
  const adulto = formulario.getByRole("checkbox", { name: /Declaro ter 18 anos/ });
  await hidratado(adulto);
  await adulto.check();
  await formulario.getByRole("checkbox", { name: /Entendi as duas durações/ }).check();
  await Promise.all([
    a.page.waitForEvent("domcontentloaded"),
    formulario.getByRole("button", { name: "Registrar autorização", exact: true }).click(),
  ]);
  expect(await contagens(a.email)).toEqual({ claims: 0, concessoes: 0 });

  await a.page.goto("/estante");
  await expect(
    a.page.getByRole("heading", { name: "Seu teste está autorizado", exact: true }),
  ).toBeVisible();
  const mundo = await criarMundo(a.page, "Jogo de teste", "Mundo do primeiro teste");
  await a.page.setViewportSize({ width: 390, height: 844 });
  await tela(a.page, "teste-mundo-preparado-mobile");
  expect(await contagens(a.email)).toEqual({ claims: 0, concessoes: 0 });

  await instancia.iniciar();
  await a.page.getByRole("link", { name: "Jogar em Mundo do primeiro teste", exact: true }).click();
  const contador = a.page.getByLabel("Valor do contador");
  await expect(contador).toHaveText("0");
  expect(await contagens(a.email)).toEqual({ claims: 1, concessoes: 1 });
  const primeiro = await periodo(a.email);
  expect(primeiro.fim.getTime() - primeiro.inicio.getTime()).toBe(
    (primeiro.coorte === "48h" ? 48 : 168) * 60 * 60 * 1000,
  );
  await a.page.getByRole("button", { name: "Somar 1", exact: true }).click();
  await expect(contador).toHaveText("1");
  await a.page.getByRole("button", { name: "Sair por dentro do jogo", exact: true }).click();
  await expect(a.page).toHaveURL(/\/estante$/);
  await a.page.goto("/conta/teste");
  await expect(
    a.page.getByRole("region", { name: "Sua autorização", exact: true }).locator("time"),
  ).toHaveCount(2);
  await tela(a.page, "teste-primeira-sessao-mobile");
  expect(await periodo(a.email)).toEqual(primeiro);

  await a.page.goto(`/jogar/teste?mundo=${mundo}`);
  await expect(contador).toHaveText("1");
  expect(await periodo(a.email)).toEqual(primeiro);
  expect(await contagens(a.email)).toEqual({ claims: 1, concessoes: 1 });
  await a.page.getByRole("button", { name: "Sair por dentro do jogo", exact: true }).click();
  await expect(a.page).toHaveURL(/\/estante$/);
});
