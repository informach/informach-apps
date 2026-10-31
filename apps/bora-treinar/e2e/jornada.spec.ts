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
  await page.getByRole("button", { name: "Confirmar e-mail" }).click();
  await expect(page).toHaveURL(/\/perfis$/);
}

test("da conta nova ao primeiro treino salvo, contando à mão", async ({ page }) => {
  const email = `bora-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.test`;
  await criarConta(page, email);

  await expect(page.getByRole("heading", { name: "Quem vai treinar?" })).toBeVisible();
  await page.getByLabel("Nome ou apelido").fill("Helena");
  await page.getByRole("button", { name: "Criar perfil" }).click();
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(page.getByText("Treino de hoje · Helena")).toBeVisible();

  // gratuito: o Primeiro treino abre; os outros pedem assinatura
  await page.goto(`/treino?ref=${encodeURIComponent("catalogo:hiit-12")}`);
  await expect(page).toHaveURL(/\/conta\?motivo=treino$/);
  await page.goto(`/treino?ref=${encodeURIComponent("catalogo:primeiro-treino")}`);
  await expect(page.getByRole("heading", { name: "Primeiro treino" })).toBeVisible();
  await page.getByRole("button", { name: "Começar treino" }).click();

  await expect(page).toHaveURL(/\/treinar\?/);
  await page.getByRole("button", { name: "Pular" }).click();
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "+1" }).click();
  await page.getByRole("button", { name: "Concluir" }).click();
  await page.getByRole("button", { name: "Sair do treino" }).click();
  await page.getByRole("button", { name: "Encerrar e salvar" }).click();

  await expect(page.getByRole("heading", { name: "Treino concluído!" })).toBeVisible();
  await expect(page.getByText("Primeiro passo")).toBeVisible();
  await page.getByRole("link", { name: "Voltar ao início" }).click();
  await page.getByRole("link", { name: "Progresso" }).first().click();
  await expect(page.getByText("Primeiro treino").first()).toBeVisible();
});
