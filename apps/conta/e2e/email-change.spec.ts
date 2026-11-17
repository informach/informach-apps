import { randomBytes, randomUUID } from "node:crypto";
import { getAppUrl } from "@informach/config/domains";
import { db, desc, eq } from "@informach/db";
import { sessions, users, verifications } from "@informach/db/schema";
import { expect, test } from "@playwright/test";

test("changes the shared email with two proofs and requires a new login", async ({
  page,
}, testInfo) => {
  if (process.env.COMPASSO_ISOLATED_DATABASE !== "1")
    throw new Error("Disposable database required");
  const origin = getAppUrl("conta", "development");
  const email = `${randomUUID()}@example.test`;
  const newEmail = `${randomUUID()}@example.test`;
  const password = randomBytes(24).toString("hex");
  await page.context().setExtraHTTPHeaders({
    "X-Real-IP": testInfo.project.name === "desktop" ? "198.51.100.71" : "198.51.100.72",
  });
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: origin },
    data: { email, password, name: "Conta de verificação" },
  });
  expect(signup.ok()).toBeTruthy();
  const [actor] = await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.email, email))
    .returning({ id: users.id });
  if (!actor) throw new Error("Missing synthetic account");
  await page.goto("/entrar");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(origin);
  const form = page.locator(".email-change-settings");
  await form.getByLabel("Novo e-mail", { exact: true }).fill(newEmail);
  await form.getByRole("button", { name: "Enviar código ao e-mail atual" }).click();
  await expect(form.getByLabel("Código do e-mail atual")).toBeVisible();
  await form
    .getByLabel("Código do e-mail atual")
    .fill(await fixtureCode(`email-verification-otp-${email}`));
  await form.getByRole("button", { name: "Confirmar e-mail atual" }).click();
  await expect(form.getByLabel("Código do novo e-mail")).toBeVisible();
  expect((await db.select().from(users).where(eq(users.id, actor.id)))[0]?.email).toBe(email);
  const code = await fixtureCode(`change-email-otp-${email}-${newEmail}`);
  await form
    .getByLabel("Código do novo e-mail")
    .fill(`${code.slice(0, 5)}${(Number(code[5]) + 1) % 10}`);
  await form.getByRole("button", { name: "Concluir troca de e-mail" }).click();
  await expect(form.getByRole("status")).toContainText("Não foi possível confirmar");
  await form.getByLabel("Código do novo e-mail").fill(code);
  await form.getByRole("button", { name: "Concluir troca de e-mail" }).click();
  await expect(form.getByRole("status")).toContainText("E-mail atualizado");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await form.screenshot({ path: testInfo.outputPath("email-changed.png") });
  expect(await db.select().from(sessions).where(eq(sessions.userId, actor.id))).toHaveLength(0);
  expect(await (await page.request.get("/api/auth/get-session")).json()).toBeNull();
  await form.getByRole("link", { name: "Entrar com o novo e-mail" }).click();
  await page.waitForURL("**/entrar");
  await page.getByLabel("E-mail", { exact: true }).fill(newEmail);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(origin);
  await expect(page.locator("#seguranca").getByLabel("E-mail", { exact: true })).toHaveValue(
    newEmail,
  );
  expect((await db.select().from(users).where(eq(users.email, newEmail)))[0]?.id).toBe(actor.id);
});

async function fixtureCode(identifier: string) {
  const [record] = await db
    .select({ value: verifications.value })
    .from(verifications)
    .where(eq(verifications.identifier, identifier))
    // Signup and resend can leave historical proofs. Better Auth verifies the
    // latest delivery, so the fixture must read the code from that delivery.
    .orderBy(desc(verifications.createdAt))
    .limit(1);
  const code = record?.value.split(":")[0];
  if (!code || !/^\d{6}$/.test(code)) throw new Error("Missing synthetic email code");
  return code;
}
