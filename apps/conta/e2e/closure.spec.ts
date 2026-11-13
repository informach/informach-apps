import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  claimWebClosureStep,
  failWebClosureStep,
  processWebClosureSteps,
} from "@informach/account/closure";
import { processDepartureAssessments } from "@informach/account/departure-reviews";
import { openCompassoAccount } from "@informach/billing/collection-accounts";
import { getCollectionApps } from "@informach/config/collections";
import { getAppUrl } from "@informach/config/domains";
import { and, db, eq, inArray } from "@informach/db";
import {
  accountDepartureReviews,
  accountWebClosureConsents,
  accountWebClosureSteps,
  accountWebClosures,
  collectionAccounts,
  familyPeople,
  users,
  webParticipations,
} from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { expect, type Page, type TestInfo, test } from "@playwright/test";

const path = "/privacidade/encerramento";
const actors: string[] = [];
test.afterEach(async () => {
  if (!actors.length) return;
  await db
    .update(accountDepartureReviews)
    .set({ state: "cancelled" })
    .where(inArray(accountDepartureReviews.actorId, actors));
  const owned = db
    .select({ id: accountWebClosures.id })
    .from(accountWebClosures)
    .where(inArray(accountWebClosures.actorId, actors));
  await db
    .update(accountWebClosureSteps)
    .set({ state: "cancelled", leaseToken: null, leaseUntil: null, completedAt: new Date() })
    .where(
      and(
        inArray(accountWebClosureSteps.closureId, owned),
        inArray(accountWebClosureSteps.state, ["queued", "running"]),
      ),
    );
  actors.length = 0;
});
async function fixture(page: Page, info: TestInfo, scenario: number) {
  if (process.env.COMPASSO_ISOLATED_DATABASE !== "1")
    throw new Error("Disposable database required");
  const email = `${randomUUID()}@example.test`,
    password = randomBytes(18).toString("hex");
  await page.context().setExtraHTTPHeaders({
    "X-Real-IP": `198.51.100.${70 + scenario * 2 + (info.project.name === "mobile" ? 1 : 0)}`,
  });
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: getAppUrl("conta", "development") },
    data: { email, password, name: "Renata da Silva" },
  });
  expect(signup.ok(), await signup.text()).toBe(true);
  const [actor] = await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.email, email))
    .returning();
  if (!actor) throw new Error("Missing closure actor");
  actors.push(actor.id);
  const family = createFamilyService({ db });
  const group = await family.createGroup(actor.id, "Família do encerramento");
  const child = await family.createPerson(actor.id, {
    groupId: group.id,
    kind: "dependent",
    displayName: "Cadastro preservado até confirmar",
  });
  const account = await openCompassoAccount(db, actor.id, group.id);
  async function login() {
    await page.goto(`/entrar?next=${encodeURIComponent(path)}`);
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await Promise.all([
      page.waitForURL((url) => url.pathname === path),
      page.getByRole("button", { name: "Entrar", exact: true }).click(),
    ]);
  }
  await login();
  await page.getByRole("button", { name: "Consultar meus aplicativos", exact: true }).click();
  await expect(page).toHaveURL(/avaliacao=/);
  // App DTOs are boundary fixtures. The central auth/actions, coordinator,
  // family/billing adapters, jobs and PostgreSQL below are real. Each app's
  // content erasure has its own isolated integration suite.
  for (const app of getCollectionApps("compasso"))
    await processDepartureAssessments({
      db,
      app: app.slug,
      limit: 1,
      assess: async (id) => {
        expect(id).toBe(actor.id);
        return {
          version: 1,
          hasPersonalData: false,
          hasSharedData: false,
          managedProfiles: 0,
          sharedProfiles: 0,
          activeCredentials: 0,
          pendingOperations: 0,
        };
      },
    });
  await page.reload();
  await page
    .getByLabel(
      "Entendo que meus acessos ao Compasso serão suspensos durante a preparação e que precisarei entrar novamente.",
    )
    .check();
  await page
    .getByRole("button", { name: "Iniciar preparação do encerramento", exact: true })
    .click();
  await expect(page).toHaveURL(/\/entrar\?/);
  await login();
  await expect(
    page.getByRole("heading", { name: "Conferindo o que será encerrado." }),
  ).toBeVisible();
  const maintenance = async () => {
    const response = await page.request.post("/api/jobs/account-maintenance", {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    expect(response.status(), await response.text()).toBe(200);
  };
  const apps = async (phase: "prepare" | "erase" | "resume") => {
    for (const app of getCollectionApps("compasso")) {
      const result = await processWebClosureSteps({
        db,
        domain: `app:${app.slug}`,
        limit: 1,
        adapter: {
          prepare: async (_tx, authority) => {
            expect(phase).toBe("prepare");
            expect(authority.actorId).toBe(actor.id);
            return {
              version: 1,
              fingerprint: createHash("sha256").update(`${actor.id}:${app.slug}`).digest("hex"),
              personalRecords: 0,
              sharedRecords: 0,
              credentials: 0,
              blockers: [],
            };
          },
          execute: async (_tx, context) => {
            expect(context.phase).toBe(phase);
            expect(context.actorId).toBe(actor.id);
          },
        },
      });
      expect(result).toEqual({ completed: 1, failed: 0, discarded: 0 });
    }
  };
  await maintenance();
  await apps("prepare");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Confira antes de confirmar." })).toBeVisible();
  return { actor, child, account, maintenance, apps, login };
}

test("closure preparation can be withdrawn without canceling contracts or deleting the family", async ({
  page,
}, info) => {
  const f = await fixture(page, info, 1);
  await page
    .getByLabel(
      "Quero manter meus dados e retomar o uso depois da conferência das operações pendentes.",
    )
    .check();
  await page.getByRole("button", { name: "Desistir do encerramento", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Preparando seu retorno aos aplicativos." }),
  ).toBeVisible();
  await f.maintenance();
  await f.apps("resume");
  await f.maintenance();
  expect(
    (await db.select().from(webParticipations).where(eq(webParticipations.userId, f.actor.id)))[0]
      ?.state,
  ).toBe("active");
  expect(await db.select().from(familyPeople).where(eq(familyPeople.id, f.child.id))).toHaveLength(
    1,
  );
  expect(
    (await db.select().from(collectionAccounts).where(eq(collectionAccounts.id, f.account.id)))[0]
      ?.closedAt,
  ).toBeNull();
  await f.login();
  await page.goto("/");
  await expect(page.getByText("Cadastro preservado até confirmar", { exact: true })).toBeVisible();
});

test("closure requires renewed consent after a changed scope and keeps the global account accessible", async ({
  page,
}, info) => {
  const f = await fixture(page, info, 2);
  const confirm = async (label: string) => {
    await page
      .getByLabel(
        "Li a preparação acima e autorizo o encerramento das etapas pendentes, com exclusão irreversível dos dados selecionados.",
      )
      .check();
    await page.getByLabel("Para confirmar, digite ENCERRAR COMPASSO").fill("ENCERRAR COMPASSO");
    await page.getByRole("button", { name: label, exact: true }).click();
  };
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("closure-prepared.png"), fullPage: true });
  await confirm("Confirmar encerramento definitivo");
  await expect(
    page.getByRole("heading", { name: "Seu encerramento está em andamento." }),
  ).toBeVisible();
  await f.maintenance();
  const change = await claimWebClosureStep(db, "app:cozya");
  if (!change || change.actorId !== f.actor.id) throw new Error("Missing changed closure fixture");
  await failWebClosureStep(db, change, "scope_changed");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Uma mudança precisa da sua atenção." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Desistir do encerramento" })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("closure-paused.png"), fullPage: true });
  await page.getByRole("button", { name: "Atualizar etapas restantes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Conferindo as etapas restantes." }),
  ).toBeVisible();
  await f.maintenance();
  await f.apps("prepare");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Confira a preparação atualizada." }),
  ).toBeVisible();
  await confirm("Confirmar continuação do encerramento");
  await expect(
    page.getByRole("heading", { name: "Seu encerramento está em andamento." }),
  ).toBeVisible();
  await f.apps("erase");
  await f.maintenance();
  expect(
    (await db.select().from(webParticipations).where(eq(webParticipations.userId, f.actor.id)))[0]
      ?.state,
  ).toBe("closed");
  expect(await db.select().from(familyPeople).where(eq(familyPeople.id, f.child.id))).toHaveLength(
    0,
  );
  expect(
    (await db.select().from(collectionAccounts).where(eq(collectionAccounts.id, f.account.id)))[0]
      ?.closedAt,
  ).not.toBeNull();
  expect(
    await db
      .select()
      .from(accountWebClosureConsents)
      .where(eq(accountWebClosureConsents.closureId, change.closureId)),
  ).toHaveLength(2);
  await f.login();
  await expect(
    page.getByRole("heading", { name: "Sua participação no Compasso foi encerrada." }),
  ).toBeVisible();
  const exported = await page.request.get("/api/account/export");
  expect(exported.status()).toBe(200);
  const copy = await exported.text();
  expect(copy).toContain('"kind":"account.closure_consents"');
  expect(copy).toContain('"state":"closed"');
  expect(copy).not.toContain('"kind":"family.current_access"');
  expect(() => JSON.parse(copy)).not.toThrow();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sua conta continua com você." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Seus dados. Seu controle." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("closure-completed.png"), fullPage: true });
});
