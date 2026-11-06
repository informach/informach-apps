import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

/** Os e-mails do teste isolado vão para disco (modo sandbox); o código vem do texto. */
const emailDir = fileURLToPath(new URL("../tmp/emails", import.meta.url));

async function codigoPara(email: string) {
  for (let tentativa = 0; tentativa < 30; tentativa++) {
    const arquivos = (await readdir(emailDir).catch(() => [])).filter((f) => f.endsWith(".json"));
    const mensagens = await Promise.all(
      arquivos.map(async (f) => JSON.parse(await readFile(join(emailDir, f), "utf8"))),
    );
    const minha = mensagens.reverse().find((m) => m.to === email && /\b\d{6}\b/.test(m.text ?? ""));
    const codigo = minha?.text?.match(/\b(\d{6})\b/)?.[1];
    if (codigo) return codigo as string;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Código não chegou para ${email}`);
}

async function criarConta(page: Page, email: string) {
  await page.goto("/entrar");
  await page.getByRole("button", { name: "Criar conta" }).first().click();
  await page.getByLabel("Seu nome").fill("Titular de teste");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("Bora-Teste-2026-Local!");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Criar conta", exact: true }).last().click();
  await expect(page.getByText("Confira seu e-mail")).toBeVisible();
  await page.getByLabel("Código de seis dígitos").fill(await codigoPara(email));
  await page.getByRole("button", { name: "Confirmar e-mail", exact: true }).click();
  await expect(page).toHaveURL(/\/perfis$/);
}

test("da conta nova ao primeiro treino salvo, contando à mão", async ({ page }) => {
  const email = `bora-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.test`;
  await criarConta(page, email);

  await expect(page.getByRole("heading", { name: "Quem vai treinar?" })).toBeVisible();
  await page.getByLabel("Nome ou apelido").fill("Helena");
  await page.getByRole("button", { name: "Criar perfil" }).click();

  // primeiro acesso: ritmo, tempo e dias por semana
  await expect(page.getByRole("heading", { name: "Oi, Helena!" })).toBeVisible();
  await page.getByText("Já treino às vezes").click();
  await page.getByText("10 min", { exact: true }).click();
  await page.getByRole("button", { name: "Começar", exact: true }).click();
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(page.getByText("Hoje é dia de · Helena")).toBeVisible();
  await expect(page.getByText("de 3 dias")).toBeVisible();

  // conta nova com e-mail confirmado ganha o teste de 7 dias: os treinos da assinatura abrem
  await page.goto(`/treino?ref=${encodeURIComponent("catalogo:hiit-12")}`);
  await expect(page.getByRole("heading", { name: "HIIT 12" })).toBeVisible();
  await expect(page.getByText("Treinando como Helena")).toBeVisible();

  await page.goto(`/treino?ref=${encodeURIComponent("catalogo:primeiro-treino")}`);
  await expect(page.getByRole("heading", { name: "Primeiro treino" })).toBeVisible();
  await page.getByRole("button", { name: /Contar manualmente/ }).click();
  await page.getByRole("button", { name: "Começar treino" }).click();

  // portão: cuidados do primeiro treino, depois começar à mão
  await expect(page).toHaveURL(/\/treinar\?/);
  await page.getByRole("button", { name: "Entendi" }).click();
  await page.getByRole("button", { name: "Começar", exact: true }).click();
  await expect(page.getByRole("button", { name: "+1" })).toBeEnabled({ timeout: 8000 });
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "+1" }).click();
  await page.getByRole("button", { name: "Parar o treino" }).click();
  await page.getByRole("button", { name: "Parar e salvar" }).click();

  // como foi? e o resumo no perfil certo
  await page.getByRole("button", { name: /Na medida/ }).click();
  await expect(page.getByRole("heading", { name: "Treino salvo" })).toBeVisible();
  await expect(page.getByText("Salvo no perfil de Helena")).toBeVisible();
  await page.getByRole("link", { name: "Voltar ao início" }).click();
  await page.getByRole("link", { name: "Progresso" }).first().click();
  await expect(page.getByText("Primeiro treino").first()).toBeVisible();
});
