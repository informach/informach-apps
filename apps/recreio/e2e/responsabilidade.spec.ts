import { expect, type Locator, type Page, type Route, test } from "@playwright/test";
import {
  comecarVigia,
  convidar,
  criarMundo,
  fecharAparelhos,
  hidratado,
  novaPessoa,
  SENHA,
  tela,
  vigia,
} from "./apoio";
import { envelhecerLogin } from "./responsabilidade-apoio";

test.beforeEach(comecarVigia);
test.afterEach(async () => {
  await fecharAparelhos();
  expect(vigia().violacoes).toEqual([]);
  expect(vigia().errosDePagina).toEqual([]);
});

async function autenticarNovamente(
  page: Page,
  pessoa: { email: string; apelido: string },
  destino: string,
) {
  await page.getByRole("link", { name: "Entrar novamente para confirmar", exact: true }).click();
  await expect(page).toHaveURL(/\/entrar\?recente=1/);
  const campo = page.getByLabel("E-mail", { exact: true });
  await hidratado(campo);
  await campo.fill(pessoa.email);
  await page.getByLabel("Senha", { exact: true }).fill(SENHA);
  await page.getByRole("button", { name: "Entrar no Recreio", exact: true }).click();
  await expect(page).toHaveURL(/\/perfis\?next=/);
  const perfil = page.getByRole("button", { name: new RegExp(pessoa.apelido) });
  await hidratado(perfil);
  await perfil.click();
  await expect(page).toHaveURL(new RegExp(`${destino}$`));
}

/** O HTML pode aparecer antes dos scripts; os controles precisam continuar indisponíveis. */
async function conferirCarregamento(page: Page, controles: Locator[]) {
  let liberar: (() => void) | undefined;
  const scripts = new Promise<void>((resolver) => {
    liberar = resolver;
  });
  const padrao = "**/_next/static/**/*.js";
  const bloquear = async (rota: Route) => {
    await scripts;
    await rota.fallback();
  };
  await page.route(padrao, bloquear);
  try {
    await page.reload({ waitUntil: "commit" });
    for (const controle of controles) await expect(controle).toBeDisabled();
  } finally {
    liberar?.();
    await page.unroute(padrao, bloquear);
  }
  for (const controle of controles) await expect(controle).toBeEnabled();
}

test("duas contas propõem e aceitam com novo login, preservam o mundo e permitem a saída do antigo responsável", async ({
  browser,
}) => {
  const lia = await novaPessoa(browser, "Lia responsável");
  const bruno = await novaPessoa(browser, "Bruno convidado");
  const id = await criarMundo(lia.page, "Morada", "Mundo da responsabilidade");
  await convidar(lia.page, bruno.page, id);
  const destino = `/conta/mundos/${id}/responsabilidade`;
  await lia.page.goto("/conta/mundos");
  await lia.page.getByRole("link", { name: "Responsabilidade pelo mundo", exact: true }).click();
  const selecao = lia.page.getByLabel("Quem vai receber a proposta?");
  await hidratado(selecao);
  await selecao.selectOption({ label: bruno.apelido });
  await envelhecerLogin(lia.email);
  await lia.page.getByRole("button", { name: "Propor transferência", exact: true }).click();
  await expect(
    lia.page.getByRole("link", { name: "Entrar novamente para confirmar", exact: true }),
  ).toBeVisible();
  await bruno.page.goto(destino);
  await expect(
    bruno.page.getByText("Você não tem uma proposta de responsabilidade pendente neste mundo.", {
      exact: true,
    }),
  ).toBeVisible();

  await autenticarNovamente(lia.page, lia, destino);
  await conferirCarregamento(lia.page, [
    lia.page.getByLabel("Quem vai receber a proposta?"),
    lia.page.getByRole("button", { name: "Propor transferência", exact: true }),
  ]);
  await lia.page.getByLabel("Quem vai receber a proposta?").selectOption({ label: bruno.apelido });
  await expect(lia.page.getByLabel("Quem vai receber a proposta?")).not.toHaveValue("");
  await lia.page.getByRole("button", { name: "Propor transferência", exact: true }).click();
  await expect(lia.page.getByText(/Proposta enviada\./)).toBeVisible();
  await expect(
    lia.page.getByRole("heading", { name: "Você responde por este mundo", exact: true }),
  ).toBeVisible();
  await bruno.page.goto(destino);
  await bruno.page.getByText("Avaliar proposta", { exact: true }).click();
  await expect(bruno.page.getByText(/Prazo para responder:.*horário de Brasília/)).toBeVisible();
  await tela(bruno.page, "responsabilidade-recebida");
  await bruno.page.setViewportSize({ width: 390, height: 844 });
  expect(
    await bruno.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await expect(
    bruno.page.getByRole("button", { name: "Aceitar e assumir responsabilidade", exact: true }),
  ).toBeVisible();
  await bruno.page
    .getByRole("button", { name: "Aceitar e assumir responsabilidade", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    bruno.page.getByRole("button", { name: "Aceitar e assumir responsabilidade", exact: true }),
  ).toBeInViewport();
  await tela(bruno.page, "responsabilidade-recebida-mobile");
  await bruno.page.setViewportSize({ width: 1365, height: 900 });
  await envelhecerLogin(bruno.email);
  await bruno.page
    .getByRole("button", { name: "Aceitar e assumir responsabilidade", exact: true })
    .click();
  await expect(
    bruno.page.getByRole("link", { name: "Entrar novamente para confirmar", exact: true }),
  ).toBeVisible();
  await autenticarNovamente(bruno.page, bruno, destino);
  await conferirCarregamento(bruno.page, [
    bruno.page.getByRole("button", { name: "Recusar proposta", exact: true }),
    bruno.page.getByRole("button", { name: "Aceitar e assumir responsabilidade", exact: true }),
  ]);
  await bruno.page.getByText("Avaliar proposta", { exact: true }).click();
  await bruno.page
    .getByRole("button", { name: "Aceitar e assumir responsabilidade", exact: true })
    .click();
  await expect(
    bruno.page.getByRole("heading", { name: "Você responde por este mundo", exact: true }),
  ).toBeVisible();
  await lia.page.goto("/conta/mundos");
  await expect(lia.page.getByText(/Membro · Participação ativa/)).toBeVisible();
  await lia.page.getByText("Quero sair deste mundo", { exact: true }).click();
  await lia.page.getByRole("button", { name: "Confirmar saída", exact: true }).click();
  await expect(lia.page).toHaveURL(/\/estante$/);
  await bruno.page.goto("/conta/mundos");
  await expect(
    bruno.page.getByRole("heading", { name: "Mundo da responsabilidade", exact: true }),
  ).toBeVisible();
  await expect(bruno.page.getByText(/Responsável · Participação ativa/)).toBeVisible();
  await bruno.page.setViewportSize({ width: 390, height: 844 });
  await bruno.page.getByRole("link", { name: "Responsabilidade pelo mundo", exact: true }).click();
  await expect(
    bruno.page.getByRole("heading", { name: "Você responde por este mundo", exact: true }),
  ).toBeVisible();
  expect(
    await bruno.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await tela(bruno.page, "responsabilidade-mobile");
});
