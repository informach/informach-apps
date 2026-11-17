import { randomUUID } from "node:crypto";
import { getAppUrl } from "@informach/config/domains";
import { and, db, eq } from "@informach/db";
import { cozyaRecipes, creditLedger } from "@informach/db/schema";
import { expect, test } from "@playwright/test";
import { browserFamily, enterCozya, family } from "./fixtures/compasso";

test("standalone decodes real images before refusing an unfunded operation", async ({ page }) => {
  const fixture = await browserFamily(false);
  await enterCozya(page, fixture, "/receitas");
  const imageDataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWP4DwYMEAoAU7oL9W/sIDEAAAAASUVORK5CYII=";
  // No funded wallet: the decoder runs, but the provider cannot be invoked.
  const response = await page.request.post("/api/ai/recipes/parse-image", {
    headers: {
      "X-Compasso-Family": fixture.groupId,
      "Idempotency-Key": randomUUID(),
      "X-Compasso-AI-Tariff": "2026-11-10-v1",
      "X-Compasso-AI-Credits": "15",
    },
    data: { imageDataUrl },
  });
  expect(response.status()).toBe(402);
  expect(await response.json()).toEqual({ code: "INSUFFICIENT_CREDITS" });
});

test("family coverage leaves culinary content personal and free context preserves the recipes", async ({
  page,
}) => {
  const owner = await browserFamily(),
    member = await browserFamily(false);
  const invitation = await family.createInvitation(owner.id, owner.groupId, member.email);
  await family.acceptInvitation(member.id, invitation.token);
  await db.insert(cozyaRecipes).values([
    {
      userId: owner.id,
      name: "Receita privada do titular",
      ingredients: "2 ovos",
      preparation: "Cozinhe.",
      creationMethod: "manual",
    },
    {
      userId: member.id,
      name: "Receita pessoal do convidado",
      ingredients: "1 ovo",
      preparation: "Cozinhe.",
      creationMethod: "manual",
    },
  ]);
  await enterCozya(page, member, "/contexto");
  await expect(page.getByLabel("Assinatura e créditos")).toHaveValue("");
  await page.getByLabel("Assinatura e créditos").selectOption(owner.groupId);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page).toHaveURL(/\/hoje$/);
  await page.goto("/receitas");
  await expect(page.getByText("Receita pessoal do convidado", { exact: true })).toBeVisible();
  await expect(page.getByText("Receita privada do titular", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Trazer uma receita", exact: true }).click();
  await expect(page.getByText(/Você tem 20 créditos de IA/)).toBeVisible();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.goto("/contexto");
  await page.getByLabel("Assinatura e créditos").selectOption("");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page).toHaveURL(/\/hoje$/);
  await page.goto("/receitas");
  await expect(page.getByText("Receita pessoal do convidado", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Trazer uma receita", exact: true }).click();
  await page.getByRole("button", { name: /Colar o texto/ }).click();
  await expect(page.getByRole("alert")).toContainText("Confira o acesso e os créditos");
  await page.goto("/contexto");
  await expect(page.getByLabel("Assinatura e créditos")).toHaveValue("");
  expect(
    await db
      .select()
      .from(creditLedger)
      .where(and(eq(creditLedger.ownerId, member.groupId), eq(creditLedger.app, "compasso"))),
  ).toHaveLength(0);
});

test("accepted AI cost and family survive a network retry; stale context cannot spend", async ({
  page,
}) => {
  const fixture = await browserFamily();
  await enterCozya(page, fixture, "/receitas");
  const attempts: Record<string, string>[] = [];
  // UI transport only: real debit/replay/provider boundaries are covered by PostgreSQL integration.
  await page.route("**/api/ai/recipes/parse-text", async (route) => {
    attempts.push(route.request().headers());
    await route.fulfill({
      status: attempts.length === 1 ? 502 : 200,
      json:
        attempts.length === 1
          ? { code: "AI_FAILED" }
          : {
              isValidRecipe: true,
              recipe: {
                name: "Arroz de teste",
                ingredients: "1 xícara de arroz",
                preparation: "Cozinhe.",
                finishing: "",
                servings: 2,
              },
            },
    });
  });
  await page.getByRole("button", { name: "Trazer uma receita", exact: true }).click();
  await page.getByRole("button", { name: /Colar o texto/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Reserva até 2 créditos compartilhados");
  await page.getByLabel("Texto da receita").fill("Arroz: cozinhe uma xícara de arroz.");
  await page.getByRole("button", { name: "Estruturar receita", exact: true }).click();
  await expect(
    page.getByText("Não foi possível concluir. Seu conteúdo foi mantido; tente novamente."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Estruturar receita", exact: true }).click();
  await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("Arroz de teste");
  expect(attempts).toHaveLength(2);
  expect(attempts[0]).toMatchObject({
    "x-compasso-family": fixture.groupId,
    "x-compasso-ai-credits": "2",
    "x-compasso-ai-tariff": "2026-11-10-v1",
  });
  expect(attempts[1]?.["idempotency-key"]).toBe(attempts[0]?.["idempotency-key"]);
  await page.goto("/contexto");
  await page.getByLabel("Assinatura e créditos").selectOption("");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page).toHaveURL(/\/hoje$/);
  const stale = await page.request.post("/api/ai/recipes/parse-text", {
    headers: { "X-Compasso-Family": fixture.groupId },
    data: { text: "Arroz" },
  });
  expect(stale.status()).toBe(409);
  expect(await stale.json()).toEqual({ code: "FAMILY_CONTEXT_CHANGED" });
  expect(
    await db
      .select()
      .from(creditLedger)
      .where(
        and(eq(creditLedger.ownerId, fixture.groupId), eq(creditLedger.entryType, "consumption")),
      ),
  ).toHaveLength(0);
});

test("subscription links retain the selected family and approved billing cycle", async ({
  page,
}) => {
  const fixture = await browserFamily(false);
  await enterCozya(page, fixture);
  await page.goto("/upgrade?cycle=annual");
  await expect(page).toHaveURL((url) => url.origin === getAppUrl("conta", "development"));
  const destination = new URL(page.url());
  expect(destination.origin).toBe(getAppUrl("conta", "development"));
  expect(destination.searchParams.get("familia")).toBe(fixture.groupId);
  expect(destination.searchParams.get("plano")).toBe("anual");
  await expect(page.getByRole("heading", { name: /Compasso/ }).first()).toBeVisible();
});
