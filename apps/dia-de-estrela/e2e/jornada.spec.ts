import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { startCompassoTrial } from "@informach/billing/compasso";
import { getAppUrl } from "@informach/config/domains";
import { db, eq } from "@informach/db";
import { users } from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";

const SENHA = "Estrela-Teste-2026-Local!";
const TELAS = path.resolve(process.cwd(), "tmp/telas");

async function tela(page: Page, nome: string) {
  await mkdir(TELAS, { recursive: true });
  await page.screenshot({
    path: path.join(TELAS, `${test.info().project.name}-${nome}.png`),
    fullPage: true,
    animations: "disabled",
  });
}

async function semRolagemLateral(page: Page) {
  const sobra = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(sobra).toBeLessThanOrEqual(1);
}

/** Central auth has dedicated journeys; this fixture verifies real SSO and app onboarding. */
async function criarFamilia(page: Page, criancas: string[]) {
  const id = createHash("sha256")
    .update(`${test.info().testId}-${test.info().project.name}`)
    .digest();
  await page.context().setExtraHTTPHeaders({ "x-real-ip": `198.51.${id[0]}.${id[1]}` });
  const email = `estrela-${randomUUID()}@example.test`;
  const central = getAppUrl("conta", "development");
  const response = await page.request.post(`${central}/api/auth/sign-up/email`, {
    headers: { origin: central },
    data: { email, password: SENHA, name: "Responsável de teste" },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const [user] = await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.email, email))
    .returning({ id: users.id });
  if (!user) throw new Error("Missing synthetic adult");
  const family = createFamilyService({ db });
  const group = await family.createGroup(user.id, "Família de teste");
  for (const name of criancas)
    await family.createPerson(user.id, { groupId: group.id, kind: "dependent", displayName: name });
  await page.goto("/entrar");
  await page.getByRole("button", { name: "Continuar com minha conta", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`^${central}/entrar`));
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(SENHA);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/comecar$/);
  await expect(page.getByRole("heading", { name: "Quem vai usar?" })).toBeVisible();
  await page.getByRole("checkbox", { name: criancas[0] ?? "Lucas", exact: true }).check();
  await tela(page, "01-primeiro-uso");
  await page.getByRole("button", { name: "Continuar" }).click();
  for (const nome of ["Manhã de escola", "Volta da escola", "Noite"])
    await page.getByRole("button", { name: new RegExp(nome) }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("PIN", { exact: true }).fill("2468");
  await page.getByLabel("Repita o PIN").fill("2468");
  await page.getByRole("button", { name: "Concluir" }).click();
  await expect(page).toHaveURL(/\/inicio$/);
  return { email, userId: user.id, groupId: group.id };
}

async function horaDaPagina(page: Page) {
  return page.evaluate(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
}

async function aparelhoDaCrianca(browser: Browser, codigo: string) {
  const uso = test.info().project.use;
  const contexto = await browser.newContext({
    baseURL: uso.baseURL,
    viewport: uso.viewport,
    userAgent: uso.userAgent,
    deviceScaleFactor: uso.deviceScaleFactor,
    isMobile: uso.isMobile,
    hasTouch: uso.hasTouch,
  });
  const crianca = await contexto.newPage();
  await crianca.goto(`/conectar`);
  await crianca.getByLabel("Código de 10 letras e números").fill(codigo);
  await crianca.getByRole("button", { name: "Conectar" }).click();
  await expect(crianca).toHaveURL(/\/crianca/);
  return { contexto, crianca };
}

/** Fecha o aparelho só depois do service worker: fechar antes derruba o Chromium. */
async function fechar(contexto: BrowserContext) {
  for (const p of contexto.pages())
    await p.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
  await contexto.close();
}

async function gerarCodigo(page: Page, criancas: string[]) {
  await page.goto("/ajustes#aparelhos");
  const secao = page.locator("#aparelhos");
  for (const nome of criancas) {
    const botao = secao.getByRole("button", { name: nome, exact: true });
    if ((await botao.getAttribute("aria-pressed")) !== "true") await botao.click();
  }
  await secao.getByRole("button", { name: "Gerar código para outro aparelho" }).click();
  const codigo = await secao.getByText(/^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/).textContent();
  if (!codigo) throw new Error("Missing pairing code");
  await tela(page, "05-codigo-aparelho");
  return codigo;
}

test("jornada: rotina, tablet, lembrete, passo a passo, aprovação, loja e PIN", async ({
  page,
  browser,
}) => {
  await criarFamilia(page, ["Lucas"]);
  await tela(page, "02-inicio-vazio");

  // Uma tarefa que começa agora, com dois passos e ok dos pais.
  await page.goto("/rotinas");
  await page.getByRole("link", { name: "Adicionar tarefa" }).click();
  await page.getByLabel("Nome da tarefa").fill("Escovar os dentes");
  await page.getByLabel("Horário", { exact: true }).fill(await horaDaPagina(page));
  await page.getByRole("button", { name: "Adicionar passo" }).click();
  await page.getByLabel("Passo 1", { exact: true }).fill("Colocar pasta na escova");
  await page.getByRole("button", { name: "Adicionar passo" }).click();
  await page.getByLabel("Passo 2", { exact: true }).fill("Escovar os dentes de cima e de baixo");
  await page.getByRole("switch", { name: "Precisa do ok dos pais" }).click();
  await tela(page, "03-editor-tarefa");
  await page.getByRole("button", { name: "Salvar tarefa" }).click();
  await expect(page).toHaveURL(/\/rotinas\?/);
  await expect(page.getByText("Escovar os dentes")).toBeVisible();
  await tela(page, "04-rotinas");

  // O aparelho da criança entra pelo código.
  const codigo = await gerarCodigo(page, ["Lucas"]);
  const { contexto, crianca } = await aparelhoDaCrianca(browser, codigo);
  await expect(crianca).toHaveURL(/\/crianca\/hoje$/);
  await tela(crianca, "06-comecar-o-dia");
  await crianca.getByRole("button", { name: /Começar o dia/ }).click();

  // O lembrete do horário aparece e leva ao passo a passo.
  const lembrete = crianca.getByRole("alertdialog", { name: "Lembrete: Escovar os dentes" });
  await expect(lembrete).toBeVisible();
  await semRolagemLateral(crianca);
  await tela(crianca, "07-lembrete");
  await lembrete.getByRole("button", { name: "Vamos lá!" }).click();
  await expect(crianca.getByRole("heading", { name: "Passo 1 de 2" })).toBeVisible();
  await tela(crianca, "08-passo-a-passo");
  await crianca.getByRole("button", { name: "Feito! Próximo passo" }).click();
  await expect(crianca.getByRole("heading", { name: "Passo 2 de 2" })).toBeVisible();
  await crianca.getByRole("button", { name: "Terminei!" }).click();
  const festa = crianca.getByRole("dialog", { name: "Escovar os dentes feita" });
  await expect(festa).toBeVisible();
  await expect(
    festa.getByText("As estrelas entram no cofrinho quando os pais derem o ok."),
  ).toBeVisible();
  await tela(crianca, "09-conquista");
  await festa.getByRole("button", { name: "Continuar" }).click();
  await expect(crianca.getByRole("heading", { name: "Tudo feito por hoje!" })).toBeVisible();
  await semRolagemLateral(crianca);
  await tela(crianca, "10-hoje-tudo-feito");

  // Os pais aprovam.
  await page.goto("/inicio");
  await expect(page.getByText("Lucas fez “Escovar os dentes”")).toBeVisible();
  await tela(page, "11-inicio-esperando-voce");
  await page.getByRole("button", { name: "Aprovar" }).click();
  await expect(page.getByText("Lucas fez “Escovar os dentes”")).toBeHidden();

  // Bônus para chegar ao item de R$ 5,00 (50 estrelas).
  await page.goto("/cofrinho");
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Dar bônus" }).click();
    await page.getByRole("button", { name: "+20", exact: true }).click();
    await page.getByRole("button", { name: "Dar +20 estrelas" }).click();
    await expect(page.getByRole("button", { name: "Dar +20 estrelas" })).toBeHidden();
  }
  await tela(page, "12-cofrinho-pais");

  // A criança pede na loja; os pais pagam.
  await crianca.goto("/crianca/cofrinho");
  // 2 da tarefa aprovada + 3 do baú do dia (única tarefa do dia) + 60 de bônus.
  await expect(crianca.getByText("65 estrelas", { exact: true }).first()).toBeVisible();
  await semRolagemLateral(crianca);
  await tela(crianca, "13-cofrinho-crianca");
  await crianca.getByRole("link", { name: "Loja" }).click();
  await tela(crianca, "14-loja");
  await crianca.getByRole("button", { name: "Pedir" }).first().click();
  await expect(crianca.getByRole("dialog", { name: "Pedido feito" })).toBeVisible();
  await crianca.getByRole("button", { name: "Combinado" }).click();
  await page.goto("/inicio");
  await expect(page.getByText("Lucas pediu R$ 5,00")).toBeVisible();
  await page.getByRole("button", { name: "Já paguei" }).click();
  await expect(page.getByText("Lucas pediu R$ 5,00")).toBeHidden();

  // PIN errado e certo no aparelho da criança.
  await crianca.goto("/crianca/pin");
  for (const d of "1111") await crianca.getByRole("button", { name: d, exact: true }).click();
  await crianca.getByRole("button", { name: "Entrar" }).click();
  await expect(crianca.getByText("PIN errado. Restam 4 tentativas.")).toBeVisible();
  await tela(crianca, "15-pin");
  for (const d of "2468") await crianca.getByRole("button", { name: d, exact: true }).click();
  await crianca.getByRole("button", { name: "Entrar" }).click();
  await expect(crianca).toHaveURL(/\/inicio$/);
  await expect(
    crianca.getByRole("button", { name: /Voltar para a tela da criança/ }),
  ).toBeVisible();
  await tela(crianca, "16-area-dos-pais-no-tablet");
  await crianca.goto("/ajustes");
  await expect(crianca.getByRole("heading", { name: "Este aparelho é da criança" })).toBeVisible();
  await fechar(contexto);
});

test("tablet compartilhado: 'Quem está usando?' com duas crianças no Compasso", async ({
  page,
  browser,
}) => {
  const { userId, groupId } = await criarFamilia(page, ["Lucas"]);
  await startCompassoTrial(
    { db, trialHashSecret: process.env.COMPASSO_TRIAL_HASH_SECRET ?? "" },
    userId,
    groupId,
  );
  const person = await createFamilyService({ db }).createPerson(userId, {
    groupId,
    kind: "dependent",
    displayName: "Marina",
  });
  await page.goto("/ajustes");
  await expect(page.getByRole("heading", { name: "Acesso da família" })).toBeVisible();
  await page.getByLabel("Ativar uma criança cadastrada").selectOption(person.id);
  await page.getByRole("button", { name: "Ativar no Dia de Estrela", exact: true }).click();
  await expect(page.getByText("Marina", { exact: true }).first()).toBeVisible();
  await tela(page, "17-ajustes-familia");
  const codigo = await gerarCodigo(page, ["Lucas", "Marina"]);
  const { contexto, crianca } = await aparelhoDaCrianca(browser, codigo);
  await expect(crianca.getByRole("heading", { name: "Quem vai usar agora?" })).toBeVisible();
  await semRolagemLateral(crianca);
  await tela(crianca, "18-quem-esta-usando");
  await crianca.getByRole("button", { name: /Marina/ }).click();
  await expect(crianca).toHaveURL(/\/crianca\/hoje$/);
  await crianca.getByRole("button", { name: /Começar o dia/ }).click();
  await expect(crianca.getByRole("heading", { name: /Marina!$/ })).toBeVisible();
  await tela(crianca, "19-hoje-marina");
  await fechar(contexto);
});
