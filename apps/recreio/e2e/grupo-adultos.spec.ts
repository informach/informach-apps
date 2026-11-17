import { expect, test } from "@playwright/test";
import { conceder, hidratado, novaPessoa, type Pessoa, tela } from "./apoio";

async function convidar(titular: Pessoa, email: string) {
  await titular.page.goto("/conta/grupo");
  const regiao = titular.page.getByRole("region", { name: "Convidar um adulto", exact: true });
  const endereco = regiao.getByLabel("E-mail do adulto", { exact: true });
  await hidratado(endereco);
  await endereco.fill(email);
  await regiao.getByLabel("Como a pessoa reconhece você", { exact: true }).fill("Ana");
  await regiao.getByRole("checkbox", { name: /Declaro ter 18 anos/ }).check();
  await Promise.all([
    titular.page.waitForEvent("domcontentloaded"),
    regiao.getByRole("button", { name: "Preparar convite", exact: true }).click(),
  ]);
  await expect(
    titular.page.getByRole("region", { name: `Convite para ${email}`, exact: true }),
  ).toBeVisible();
}
async function aceitar(adulto: Pessoa, novo = false) {
  await adulto.page.goto("/conta/grupo");
  const convite = adulto.page.getByRole("region", { name: "Convite de Ana", exact: true });
  const declaracao = convite.getByRole("checkbox", {
    name: "Declaro ter 18 anos ou mais.",
    exact: true,
  });
  await hidratado(declaracao);
  if (novo) await convite.getByLabel("Seu apelido no jogo", { exact: true }).fill(adulto.apelido);
  else
    await expect(
      convite.getByText(`Continuar com o perfil ${adulto.apelido}`, { exact: true }),
    ).toBeVisible();
  await declaracao.check();
  await convite
    .getByRole("checkbox", { name: /Entendo que minha cobrança própria continua/ })
    .check();
  await Promise.all([
    adulto.page.waitForEvent("domcontentloaded"),
    convite.getByRole("button", { name: "Aceitar convite", exact: true }).click(),
  ]);
  await expect(
    adulto.page.getByRole("region", { name: "Convite de Ana", exact: true }),
  ).toHaveCount(0);
  await expect(
    adulto.page.getByText("Seu perfil participa do grupo de outro adulto.", { exact: false }),
  ).toBeVisible();
}

test("titular sem jogador convida; adulto conserva perfil, sai, retoma cobertura própria e pode ser retirado", async ({
  browser,
}) => {
  const a = await novaPessoa(browser, "Ana", { semPerfil: true });
  const b = await novaPessoa(browser, "Bruno");
  conceder(a.email, "family");
  await convidar(a, b.email);
  await b.page.goto("/conta/grupo");
  await b.page.setViewportSize({ width: 390, height: 844 });
  const convite = b.page.getByRole("region", { name: "Convite de Ana", exact: true });
  await convite.scrollIntoViewIfNeeded();
  expect(
    await b.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await tela(b.page, "grupo-convite-celular");
  await aceitar(b);
  await b.page.reload();
  const participacao = b.page.getByRole("region", {
    name: "Seu perfil e sua participação",
    exact: true,
  });
  const reconhecer = participacao.getByRole("checkbox", { name: /Entendo os efeitos/ });
  await hidratado(reconhecer);
  await reconhecer.check();
  await Promise.all([
    b.page.waitForEvent("domcontentloaded"),
    participacao.getByRole("button", { name: "Sair deste grupo", exact: true }).click(),
  ]);
  await expect(participacao.getByText(/Seu perfil está guardado/)).toBeVisible();
  await reconhecer.check();
  await Promise.all([
    b.page.waitForEvent("domcontentloaded"),
    participacao.getByRole("button", { name: "Usar minha cobertura própria", exact: true }).click(),
  ]);
  await expect(
    participacao.getByText("Bruno · Com cobertura para jogar", { exact: true }),
  ).toBeVisible();
  await expect(
    participacao.getByText("Seu perfil participa do grupo que você administra.", { exact: true }),
  ).toBeVisible();
  await participacao.scrollIntoViewIfNeeded();
  await tela(b.page, "grupo-participacao-celular");
  await convidar(a, b.email);
  await aceitar(b);
  await a.page.goto("/conta/grupo");
  const participante = a.page.getByRole("region", { name: "Participação de Bruno", exact: true });
  const retirar = participante.getByRole("checkbox", { name: /Entendo que retirar encerra/ });
  await hidratado(retirar);
  await retirar.check();
  await Promise.all([
    a.page.waitForEvent("domcontentloaded"),
    participante.getByRole("button", { name: "Retirar adulto do grupo", exact: true }).click(),
  ]);
  await expect(participante).toHaveCount(0);
  await b.page.reload();
  await expect(participacao.getByText(/Seu perfil está guardado/)).toBeVisible();
  await a.page.goto("/conta");
  await expect(a.page.getByRole("heading", { name: "Quem está jogando", exact: true })).toHaveCount(
    0,
  );
});

test("adulto sem perfil aceita criando o próprio; recusa e revogação encerram as pendências", async ({
  browser,
}) => {
  const a = await novaPessoa(browser, "Ana", { semPerfil: true });
  const b = await novaPessoa(browser, "Lua", { semPerfil: true });
  conceder(a.email, "family");
  await convidar(a, b.email);
  await aceitar(b, true);
  await b.page.reload();
  await expect(
    b.page
      .getByRole("region", { name: "Seu perfil e sua participação", exact: true })
      .getByText("Lua · Com cobertura para jogar", { exact: true }),
  ).toBeVisible();
  const c = await novaPessoa(browser, "Maré", { semPerfil: true });
  await convidar(a, c.email);
  await c.page.goto("/conta/grupo");
  const recebido = c.page.getByRole("region", { name: "Convite de Ana", exact: true });
  const recusar = recebido.getByRole("button", { name: "Recusar convite", exact: true });
  await hidratado(recusar);
  await Promise.all([c.page.waitForEvent("domcontentloaded"), recusar.click()]);
  await expect(recebido).toHaveCount(0);
  await convidar(a, c.email);
  const enviado = a.page.getByRole("region", { name: `Convite para ${c.email}`, exact: true });
  const revogar = enviado.getByRole("button", { name: "Revogar convite", exact: true });
  await hidratado(revogar);
  await Promise.all([a.page.waitForEvent("domcontentloaded"), revogar.click()]);
  await expect(enviado).toHaveCount(0);
  await c.page.reload();
  await expect(recebido).toHaveCount(0);
});
