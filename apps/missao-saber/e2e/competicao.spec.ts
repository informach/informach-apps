import { createHash, randomUUID } from "node:crypto";
import { and, db, eq } from "@informach/db";
import { customers, missaoCompetitionTurns, subscriptions, users } from "@informach/db/schema";
import { expect, type Page, test } from "@playwright/test";
import { itemSchema } from "../src/features/content/types";
import { encontrarDesafio } from "../src/features/pecas/catalogo";
import { montagemInicial } from "../src/features/pecas/montagem";
import { teclasAteASolucao } from "../src/features/pecas/plano";
import { ehMalha } from "../src/features/pecas/tipos";
import { enterStudy, prepareProfile } from "./family-helpers";

async function familiaAssinante(page: Page, baseURL?: string) {
  if (!baseURL) throw new Error("Missing isolated origin");
  const email = `competicao-${randomUUID()}@example.test`;
  const password = "Competicao-Local-2026!";
  const client = createHash("sha256").update(test.info().testId).digest();
  const headers = { origin: baseURL, "x-real-ip": `198.20.${client[0]}.${client[1]}` };
  await page.setExtraHTTPHeaders({ "x-real-ip": headers["x-real-ip"] });
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { email, password, name: "Competição local" },
  });
  expect(signup.ok(), await signup.text()).toBe(true);
  await db.update(users).set({ emailVerified: true }).where(eq(users.email, email));
  const login = await page.request.post("/api/auth/sign-in/email", {
    headers,
    data: { email, password },
  });
  expect(login.ok(), await login.text()).toBe(true);
  const [owner] = await db.select().from(users).where(eq(users.email, email));
  if (!owner) throw new Error("Missing owner");
  const [customer] = await db
    .insert(customers)
    .values({
      provider: "stripe",
      providerCustomerId: `cus_comp_${randomUUID()}`,
      subjectType: "user",
      subjectId: owner.id,
      app: "missao-saber",
      email,
    })
    .returning();
  if (!customer) throw new Error("Missing customer");
  await db.insert(subscriptions).values({
    customerId: customer.id,
    productId: "missao_family_monthly",
    provider: "stripe",
    providerSubscriptionId: `sub_comp_${randomUUID()}`,
    providerPriceId: "price_local",
    status: "active",
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 86_400_000),
  });
  return owner.id;
}

/** Monta pelo teclado um desafio em malha, com a mesma mesa que o aparelho usa. */
async function montarPeloTeclado(page: Page) {
  const mesa = page.locator("[data-desafio]");
  await expect(mesa).toBeVisible();
  const desafio = encontrarDesafio((await mesa.getAttribute("data-desafio")) ?? "");
  const semente = Number(await mesa.getAttribute("data-semente"));
  if (!desafio || !ehMalha(desafio)) throw new Error("O teste espera um desafio em malha");
  const { passos } = teclasAteASolucao(desafio, montagemInicial(desafio, semente));
  for (const passo of passos) {
    await page.getByRole("button", { name: passo.nome, exact: true }).focus();
    for (const tecla of passo.teclas) await page.keyboard.press(tecla);
  }
}

test("competição: sorteio, acerto, tempo esgotado, desafio montado e pódio", async ({
  page,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "A sala é pensada para tablet e TV.");
  test.setTimeout(180_000);
  await familiaAssinante(page, baseURL);
  await prepareProfile(page, "Lia", "5", "canguru-e");
  await prepareProfile(page, "Theo", "8", "obmep-n2");

  await page.goto("/familia/competicoes");
  await page.getByRole("link", { name: "Nova competição" }).first().click();
  await page.getByLabel("Nome da competição").fill("Sábado de teste");
  for (let i = 0; i < 5; i += 1)
    await page.getByRole("button", { name: "Menos: Problemas por criança" }).click();
  await page
    .locator("label")
    .filter({ hasText: /^20 s$/ })
    .click();
  await page.getByRole("button", { name: "Sortear e abrir a sala" }).click();
  await expect(page).toHaveURL(/\/familia\/competicoes\/[a-f\d-]{36}$/);
  const competicaoId = page.url().split("/").at(-1) ?? "";

  // O desafio é sorteado; para montar pelo teclado, a vez de Lia fica com um em malha.
  await db
    .update(missaoCompetitionTurns)
    .set({ puzzleId: "katamino-5x3" })
    .where(
      and(
        eq(missaoCompetitionTurns.competitionId, competicaoId),
        eq(missaoCompetitionTurns.position, 2),
      ),
    );

  // Vez 1: Lia acerta.
  await expect(page.getByRole("heading", { name: "É a vez de Lia" })).toBeVisible();
  await page.getByRole("button", { name: "Começar", exact: true }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  const [primeira] = await db
    .select()
    .from(missaoCompetitionTurns)
    .where(
      and(
        eq(missaoCompetitionTurns.competitionId, competicaoId),
        eq(missaoCompetitionTurns.position, 0),
      ),
    );
  const item = itemSchema.parse(primeira?.item);
  if (item.type === "choice")
    await page.getByRole("radio", { name: item.answer, exact: true }).check();
  else if (item.type === "numeric")
    await page.getByLabel(/^Seu valor/).fill(String(item.grading.value));
  await page.getByRole("button", { name: "Responder", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Acertou, Lia!" })).toBeVisible();
  await expect(page.getByText("+1 ponto")).toBeVisible();
  await page.getByRole("button", { name: "Próxima: vez de Theo" }).click();

  // Vez 2: o tempo de Theo acaba sem resposta.
  await expect(page.getByRole("heading", { name: "É a vez de Theo" })).toBeVisible();
  await page.getByRole("button", { name: "Começar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "O tempo acabou." })).toBeVisible({
    timeout: 40_000,
  });
  await page.getByRole("button", { name: "Próxima: vez de Lia" }).click();

  // Vez 3: Lia monta o desafio pelo teclado.
  await page.getByRole("button", { name: "Começar", exact: true }).click();
  await montarPeloTeclado(page);
  await expect(page.getByRole("heading", { name: "Montou, Lia!" })).toBeVisible();
  await page.getByRole("button", { name: "Próxima: vez de Theo" }).click();

  // Vez 4: quem coordena encerra o desafio de Theo.
  await page.getByRole("button", { name: "Começar", exact: true }).click();
  await page.getByRole("button", { name: "Encerrar e mostrar a solução" }).click();
  await expect(page.getByRole("heading", { name: "Desafio encerrado." })).toBeVisible();
  await page.getByRole("button", { name: "Ver o pódio" }).click();

  await expect(page.getByRole("heading", { name: "Pódio" })).toBeVisible();
  const classificacao = page.getByRole("list", { name: "Classificação" });
  await expect(classificacao.getByText("Lia")).toBeVisible();
  await expect(classificacao.getByText("4 pontos")).toBeVisible();
  await expect(page.getByRole("table")).toContainText("Theo");

  await page.goto("/familia/competicoes");
  await expect(page.getByRole("heading", { name: "Encerradas" })).toBeVisible();
  await expect(page.getByText("Sábado de teste")).toBeVisible();
});

test("laboratório: treinar um desafio de peças e ver o registro", async ({ page, baseURL }) => {
  await familiaAssinante(page, baseURL);
  await prepareProfile(page, "Bia", "3", "canguru-p");
  await enterStudy(page, "Bia");
  await page.goto("/laboratorio");
  await page.getByRole("link", { name: /Desafios de peças/ }).click();
  await expect(page.getByRole("heading", { name: "Desafios de peças", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Montar: Retângulo 5 × 3" }).click();
  await montarPeloTeclado(page);
  await expect(page.getByRole("heading", { name: /^Montou em/ })).toBeVisible();
  await page.getByRole("link", { name: "Escolher outro desafio" }).click();
  await expect(page.getByText(/Montado 1 vez/)).toBeVisible();
});
