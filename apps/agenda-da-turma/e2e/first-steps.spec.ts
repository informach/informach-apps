import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { db, eq } from "@informach/db";
import {
  accounts,
  agendaProductEvents,
  agendaStudentProfiles,
  emailDeliveries,
  users,
} from "@informach/db/schema";
import { expect, test } from "@playwright/test";

test("first steps guide the setup, react to what exists and can be dismissed", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(180_000);
  if (!baseURL) throw new Error("Local app required");
  const id = `first-steps-${randomUUID()}`;
  const email = `${id}@e2e.local`;
  try {
    const authRequire = createRequire(
      path.resolve(process.cwd(), "../../packages/auth/package.json"),
    );
    const { hashPassword } = await import(
      pathToFileURL(authRequire.resolve("better-auth/crypto")).href
    );
    await db.insert(users).values({ id, name: "Responsável fictício", email, emailVerified: true });
    await db.insert(accounts).values({
      id: randomUUID(),
      userId: id,
      accountId: id,
      providerId: "credential",
      password: await hashPassword("FirstSteps!Synthetic2026"),
    });
    const login = await context.request.post(`${baseURL}/api/auth/sign-in/email`, {
      headers: { Origin: baseURL },
      data: { email, password: "FirstSteps!Synthetic2026" },
    });
    expect(login.ok()).toBe(true);
    // O grátis vale por padrão: depois do login, a conta vai direto para Hoje.
    await page.goto("/dashboard");

    const section = page.getByRole("region", { name: "Primeiros passos" });
    await expect(section).toBeVisible();
    await expect(section.getByText("0 de 4 prontos", { exact: false })).toBeVisible();
    await expect(
      section.getByRole("link", { name: "Adicionar criança", exact: true }),
    ).toBeVisible();

    // A trilha lê o banco: cadastrar a criança fecha o primeiro passo sozinho.
    await db.insert(agendaStudentProfiles).values({ userId: id, name: "Criança fictícia" });
    await page.reload();
    await expect(section.getByText("1 de 4 prontos", { exact: false })).toBeVisible();
    // Depois da criança, o primeiro recado: é o que a família veio fazer.
    await expect(
      section.getByRole("link", { name: "Trazer um recado", exact: true }),
    ).toBeVisible();

    await section.getByRole("button", { name: "Dispensar", exact: true }).click();
    await expect(section).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("region", { name: "Primeiros passos" })).toHaveCount(0);
  } finally {
    await db.delete(agendaProductEvents).where(eq(agendaProductEvents.userId, id));
    await db.delete(emailDeliveries).where(eq(emailDeliveries.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }
});
