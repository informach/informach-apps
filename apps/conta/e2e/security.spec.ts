import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { getAppUrl } from "@informach/config/domains";
import { db, eq } from "@informach/db";
import { users } from "@informach/db/schema";
import { expect, test } from "@playwright/test";

test("authenticator, recovery and browser revocation", async ({ page, browser }, testInfo) => {
  const origin = getAppUrl("conta", "development");
  const suffix = testInfo.project.name === "desktop" ? 41 : 42;
  await page.context().setExtraHTTPHeaders({ "X-Real-IP": `198.51.100.${suffix}` });
  const email = `${randomUUID()}@example.test`;
  const password = randomBytes(24).toString("hex");
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: origin },
    data: { email, password, name: "Conta de segurança" },
  });
  expect(signup.ok()).toBe(true);
  await db.update(users).set({ emailVerified: true }).where(eq(users.email, email));
  await page.goto("/entrar");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  const settings = page.locator(".two-factor-settings");
  await settings.getByLabel("Confirme sua senha").fill(password);
  await settings.getByRole("button", { name: "Configurar autenticador" }).click();
  await expect(
    settings.getByRole("img", { name: "Código QR para o aplicativo autenticador" }),
  ).toBeVisible();
  const secret = await settings.getByLabel("Chave para configuração manual").inputValue();
  const code = await settings.locator(".recovery-codes code").first().innerText();
  await settings.getByLabel("Código do autenticador").fill(totp(secret));
  await settings
    .getByRole("checkbox", { name: "Guardei os códigos de recuperação em um lugar seguro." })
    .check();
  await settings.getByRole("button", { name: "Ativar autenticador" }).click();
  await expect(
    settings.getByText("Ativada. Sua entrada também pede um código do autenticador."),
  ).toBeVisible();
  await expect(settings.locator(".recovery-codes")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  const other = await browser.newContext({
    baseURL: origin,
    extraHTTPHeaders: { "X-Real-IP": `198.51.100.${suffix + 4}` },
  });
  try {
    const otherPage = await other.newPage();
    await otherPage.goto("/entrar");
    await otherPage.getByLabel("E-mail", { exact: true }).fill(email);
    await otherPage.getByLabel("Senha", { exact: true }).fill(password);
    await otherPage.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(otherPage.getByRole("heading", { name: "Mais uma confirmação." })).toBeVisible();
    expect(await (await other.request.get("/api/auth/get-session")).json()).toBeNull();
    await otherPage.getByRole("button", { name: "Usar código de recuperação" }).click();
    await otherPage.getByLabel("Código de recuperação", { exact: true }).fill(code);
    await otherPage.getByRole("button", { name: "Confirmar entrada" }).click();
    await expect(
      otherPage.getByRole("heading", { name: "Onde sua conta está aberta" }),
    ).toBeVisible();
    await page.reload();
    const sessions = page.locator(".session-settings");
    await expect(sessions.locator(".session-list > li")).toHaveCount(2);
    const allEntries = sessions.locator(":scope > form");
    await allEntries.getByRole("checkbox").check();
    await allEntries.getByRole("button", { name: "Encerrar entradas selecionadas" }).click();
    await expect(sessions.locator(".session-list > li")).toHaveCount(1);
    await otherPage.reload();
    await expect(otherPage.getByRole("heading", { name: "Uma conta. Seu lugar." })).toBeVisible();
    await page.locator("#seguranca").screenshot({ path: testInfo.outputPath("security.png") });
    await page.getByRole("button", { name: "Sair deste navegador", exact: true }).first().click();
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.getByLabel("Código do autenticador").fill(totp(secret));
    await page.getByRole("button", { name: "Confirmar entrada" }).click();
    await expect(page.getByRole("heading", { name: "Onde sua conta está aberta" })).toBeVisible();
  } finally {
    await other.close();
  }
});

function totp(secret: string) {
  const bits = [...secret.toUpperCase()]
    .map((char) => {
      const value = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(char);
      if (value < 0) throw new Error("Invalid base32 fixture");
      return value.toString(2).padStart(5, "0");
    })
    .join("");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}
