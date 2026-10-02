import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import { users } from "@informach/db/schema";
import { expect, test } from "@playwright/test";

test("confirmação de pagamento continua consultando após a primeira resposta pendente", async ({
  page,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Missing isolated app URL");
  const email = `payment-${randomUUID()}@example.test`;
  const password = "Missao-Teste-2026-Local!";
  // Cada projeto representa outro responsável. Isolar o IP de cadastro evita
  // compartilhar o limite real de cinco contas/hora com as outras jornadas.
  const headers = {
    origin: baseURL,
    "x-forwarded-for": test.info().project.name === "mobile" ? "192.0.2.22" : "192.0.2.21",
  };
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { email, password, name: "Responsável do pagamento" },
  });
  expect(signup.ok(), await signup.text()).toBe(true);
  // A autenticação por código já tem sua própria jornada. Esta conta local
  // verificada isola o retorno do checkout, sem enviar nem simular cobranças.
  await db.update(users).set({ emailVerified: true }).where(eq(users.email, email));
  const login = await page.request.post("/api/auth/sign-in/email", {
    headers,
    data: { email, password },
  });
  expect(login.ok(), await login.text()).toBe(true);
  let refreshes = 0;
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      url.pathname === "/familia" &&
      url.searchParams.get("pagamento") === "recebido" &&
      response.request().headers().rsc === "1" &&
      response.ok()
    )
      refreshes += 1;
  });
  await page.goto("/familia?pagamento=recebido");
  await expect(page.getByText("Confirmando o pagamento com a operadora…")).toBeVisible();
  await expect.poll(() => refreshes, { timeout: 15000 }).toBeGreaterThanOrEqual(2);
  await expect(page.getByText("Confirmando o pagamento com a operadora…")).toBeVisible();
});
