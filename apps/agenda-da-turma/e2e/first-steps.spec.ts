import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { browserFamily, browserProfile, enterAgenda } from "./fixtures/compasso";

test("first steps guide the setup, react to what exists and can be dismissed", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(180_000);
  if (!baseURL) throw new Error("Local app required");
  const id = `first-steps-${randomUUID()}`;
  const email = `${id}@e2e.local`;
  const f = await browserFamily({ id, email, password: "FirstSteps!Synthetic2026" });
  await enterAgenda(page, f);
  const section = page.getByRole("region", { name: "Primeiros passos" });
  await expect(section).toBeVisible();
  await expect(section.getByText("0 de 4 prontos", { exact: false })).toBeVisible();
  await expect(section.getByRole("link", { name: "Adicionar criança", exact: true })).toBeVisible();

  // A trilha lê o banco: cadastrar a criança fecha o primeiro passo sozinho.
  await browserProfile(f, "Criança fictícia");
  await page.reload();
  await expect(section.getByText("1 de 4 prontos", { exact: false })).toBeVisible();
  // Depois da criança, o primeiro recado: é o que a família veio fazer.
  await expect(section.getByRole("link", { name: "Trazer um recado", exact: true })).toBeVisible();

  await section.getByRole("button", { name: "Dispensar", exact: true }).click();
  await expect(section).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("region", { name: "Primeiros passos" })).toHaveCount(0);
});
