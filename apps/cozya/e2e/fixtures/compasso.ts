import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { startCompassoTrial } from "@informach/billing/compasso";
import { getAppUrl } from "@informach/config/domains";
import { db } from "@informach/db";
import { accounts, users } from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { expect, type Page } from "@playwright/test";

if (process.env.COMPASSO_ISOLATED_DATABASE !== "1")
  throw new Error("Cozya browser fixtures require the disposable Compasso database");
export const family = createFamilyService({ db });
export async function browserFamily(trial = true) {
  const id = randomUUID(),
    email = `${id}@example.test`,
    password = "Compasso-Synthetic-2026!";
  const authRequire = createRequire(
    path.resolve(process.cwd(), "../../packages/auth/package.json"),
  );
  const { hashPassword } = await import(
    pathToFileURL(authRequire.resolve("better-auth/crypto")).href
  );
  await db.insert(users).values({ id, email, name: "Pessoa fictícia", emailVerified: true });
  await db.insert(accounts).values({
    id: randomUUID(),
    userId: id,
    accountId: id,
    providerId: "credential",
    password: await hashPassword(password),
  });
  const group = await family.createGroup(id, "Família de teste");
  if (trial)
    await startCompassoTrial(
      { db, trialHashSecret: "cozya-browser-isolated-secret".repeat(3) },
      id,
      group.id,
    );
  return { id, email, password, groupId: group.id };
}
export type BrowserFamily = Awaited<ReturnType<typeof browserFamily>>;
export async function enterCozya(page: Page, f: BrowserFamily, next = "/hoje") {
  const address = createHash("sha256").update(f.id).digest();
  await page.context().setExtraHTTPHeaders({ "x-real-ip": `198.51.${address[0]}.${address[1]}` });
  const central = getAppUrl("conta", "development");
  const response = await page.request.post(`${central}/api/auth/sign-in/email`, {
    headers: { Origin: central },
    data: { email: f.email, password: f.password },
  });
  expect(response.ok(), `Central sign-in returned ${response.status()}`).toBe(true);
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByRole("button", { name: "Continuar com minha conta", exact: true }).click();
  await expect(page).toHaveURL(new URL(next, getAppUrl("cozya", "development")).toString());
}
