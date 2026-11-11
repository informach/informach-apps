import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { startCompassoTrial } from "@informach/billing/compasso";
import { getAppUrl } from "@informach/config/domains";
import { db } from "@informach/db";
import { accounts, agendaStudentProfiles, users } from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { expect, type Page } from "@playwright/test";

if (process.env.COMPASSO_ISOLATED_DATABASE !== "1")
  throw new Error("Agenda browser fixtures require the disposable Compasso database");
export const family = createFamilyService({ db });
export async function browserFamily(
  input: { id?: string; email?: string; password?: string; paid?: boolean } = {},
) {
  const id = input.id ?? randomUUID(),
    email = input.email ?? `${id}@example.test`,
    password = input.password ?? "Compasso-Synthetic-2026!";
  const authRequire = createRequire(
    path.resolve(process.cwd(), "../../packages/auth/package.json"),
  );
  const { hashPassword } = await import(
    pathToFileURL(authRequire.resolve("better-auth/crypto")).href
  );
  await db.insert(users).values({ id, email, name: "Responsável fictício", emailVerified: true });
  await db.insert(accounts).values({
    id: randomUUID(),
    userId: id,
    accountId: id,
    providerId: "credential",
    password: await hashPassword(password),
  });
  const group = await family.createGroup(id, "Família de teste");
  if (input.paid)
    await startCompassoTrial(
      { db, trialHashSecret: "agenda-browser-isolated-secret".repeat(3) },
      id,
      group.id,
    );
  return { id, email, password, groupId: group.id };
}
export type BrowserFamily = Awaited<ReturnType<typeof browserFamily>>;
export async function browserProfile(f: BrowserFamily, name: string) {
  const person = await family.createPerson(f.id, {
    groupId: f.groupId,
    kind: "dependent",
    displayName: name,
  });
  const result = await family.activateProfile(
    f.id,
    { groupId: f.groupId, personId: person.id, app: "agenda-da-turma" },
    async (tx, familyProfileId) => {
      const [profile] = await tx
        .insert(agendaStudentProfiles)
        .values({ familyProfileId })
        .returning();
      if (!profile) throw new Error("Missing native school profile");
      return profile;
    },
  );
  return { ...result.value, personId: person.id };
}
export async function enterAgenda(
  page: Page,
  f: Pick<BrowserFamily, "id" | "email" | "password">,
  next = "/dashboard",
) {
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
  await expect(page).toHaveURL(
    new URL(next, getAppUrl("agenda-da-turma", "development")).toString(),
  );
}
