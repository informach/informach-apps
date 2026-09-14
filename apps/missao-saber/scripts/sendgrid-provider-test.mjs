import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const recipient = process.env.MISSAO_EMAIL_TEST_RECIPIENT;
if (!recipient || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient))
  throw new Error("Set MISSAO_EMAIL_TEST_RECIPIENT to an authorized test inbox");
const origin = process.env.MISSAO_EMAIL_TEST_ORIGIN ?? "https://missao-saber.informach.com.br";
if (new URL(origin).protocol !== "https:") throw new Error("Email provider test requires HTTPS");
const startedAt = new Date();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${origin}/entrar`);
  await page.getByLabel("E-mail do responsável", { exact: true }).fill(recipient);
  await page.getByRole("button", { name: "Entrar com código por e-mail" }).click();
  await page.getByText("Se você já tem uma conta, confira seu e-mail.").waitFor();

  await page.goto(`${origin}/entrar`);
  await page.getByRole("button", { name: "Esqueci minha senha" }).click();
  await page.getByLabel("E-mail do responsável", { exact: true }).fill(recipient);
  await page.getByRole("button", { name: "Enviar código de recuperação" }).click();
  await page
    .getByText(
      "Se houver uma conta com esse e-mail, você receberá um código para redefinir a senha.",
    )
    .waitFor();

  const outputDirectory = resolve(import.meta.dirname, "../tmp/production");
  mkdirSync(outputDirectory, { recursive: true });
  const result = {
    startedAt: startedAt.toISOString(),
    origin,
    requests: ["auth.sign-in-otp", "auth.forget-password-otp"],
    providerAccepted: "verify_in_delivery_ledger",
  };
  writeFileSync(
    resolve(outputDirectory, "sendgrid-provider-request.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
