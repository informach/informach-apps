import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { parse } from "dotenv";
import postgres from "postgres";

const root = resolve(import.meta.dirname, "../../..");
const app = resolve(root, "apps/missao-saber");
const requireBilling = createRequire(resolve(root, "packages/billing/package.json"));
const Stripe = requireBilling("stripe");
const localEnv = parse(readFileSync(resolve(app, ".env.local")));
const rootEnv = parse(readFileSync(resolve(root, ".env")));
const databaseName = process.argv[2];
if (!/^missao_provider_[a-f0-9]{32}$/.test(databaseName ?? ""))
  throw new Error("Pass a database created by pnpm providers:setup");
if (localEnv.STRIPE_MODE !== "dev" || !/^(sk|rk)_test_/.test(localEnv.STRIPE_SECRET_KEY ?? ""))
  throw new Error("Stripe provider test requires a test-mode key");
const databaseUrl = new URL(rootEnv.DATABASE_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname))
  throw new Error("Stripe provider test requires local PostgreSQL");
databaseUrl.pathname = `/${databaseName}`;
const sql = postgres(databaseUrl.toString(), { max: 2 });
const stripe = new Stripe(localEnv.STRIPE_SECRET_KEY, {
  apiVersion: "2026-04-22.dahlia",
  timeout: 30000,
});
const providerPort = process.env.MISSAO_PROVIDER_PORT ?? "3005";
if (!/^\d{4,5}$/.test(providerPort) || Number(providerPort) > 65535)
  throw new Error("MISSAO_PROVIDER_PORT must be a local TCP port");
const origin = `http://localhost:${providerPort}`;
const runId = randomUUID();
const email = `ms-${runId.slice(0, 12)}@example.test`;
const emailDirectory = resolve(app, `tmp/provider-emails-${databaseName}`);
const outputDirectory = resolve(app, "tmp/production");
mkdirSync(outputDirectory, { recursive: true });
let clockId = "";
let remoteCustomerId = "";
let browser;
const relevantEvents = new Set([
  "checkout.session.completed",
  "checkout.session.expired",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);
const replayedEventIds = new Set();

async function poll(label, operation, predicate, timeout = 45000) {
  const deadline = Date.now() + timeout;
  let latest;
  while (Date.now() < deadline) {
    latest = await operation();
    if (predicate(latest)) return latest;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(`${label} did not converge: ${JSON.stringify(latest)}`);
}

async function localSubscription() {
  const rows = await sql`
    select s.*
      from billing.subscriptions s
      join billing.customers c on c.id = s.customer_id
     where c.provider_customer_id = ${remoteCustomerId}
     order by s.created_at desc
     limit 1
  `;
  return rows[0] ?? null;
}

async function checkoutIntentCount() {
  const rows = await sql`
    select count(*)::int as count
      from billing.checkout_intents i
      join billing.customers c on c.id = i.customer_id
     where c.provider_customer_id = ${remoteCustomerId}
  `;
  return rows[0]?.count ?? 0;
}

async function clickUntil(label, locator, predicate) {
  let latest;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await locator.click();
    for (let check = 0; check < 12; check += 1) {
      latest = await localSubscription();
      if (predicate(latest)) return latest;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
    }
  }
  throw new Error(`${label} did not converge after UI retries: ${JSON.stringify(latest)}`);
}

async function waitForClock() {
  return poll(
    "Stripe test clock",
    () => stripe.testHelpers.testClocks.retrieve(clockId),
    (clock) => clock.status === "ready",
    120000,
  );
}

async function advanceClock(frozenTime) {
  await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: frozenTime });
  return waitForClock();
}

async function replayRealProviderEvents(createdAt) {
  // Stripe CLI forwards real test events once, while production retries 5xx.
  // Replaying the retrieved provider payloads sequentially makes the isolated
  // harness deterministic if the local machine has a transient delivery error.
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 1500));
  const events = await stripe.events.list({ created: { gte: createdAt }, limit: 100 });
  const matching = events.data
    .filter((event) => relevantEvents.has(event.type))
    .filter((event) => !replayedEventIds.has(event.id))
    .filter((event) => {
      const object = event.data.object;
      const customer = typeof object.customer === "string" ? object.customer : object.customer?.id;
      return customer === remoteCustomerId;
    })
    .reverse();
  for (const event of matching) {
    const payload = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: localEnv.STRIPE_WEBHOOK_SECRET,
    });
    const response = await fetch(`${origin}/api/webhooks/stripe`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": signature },
      body: payload,
    });
    if (!response.ok) throw new Error(`Real provider event replay returned ${response.status}`);
    replayedEventIds.add(event.id);
  }
}

function otpFor(recipient) {
  for (const file of readdirSync(emailDirectory).filter((name) => name.endsWith(".json"))) {
    const message = JSON.parse(readFileSync(resolve(emailDirectory, file), "utf8"));
    if (message.to === recipient && message.category === "auth.verify-email-otp") {
      const code = message.text?.match(/\b\d{6}\b/)?.[0];
      if (code) return code;
    }
  }
  return "";
}

try {
  // Each run uses a disposable database; prior failed harness attempts must
  // not consume the auth IP quota of the next independent run.
  await sql`delete from core.rate_limit`;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  await page.goto(`${origin}/entrar`);
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await page.getByLabel("Como podemos chamar o responsável?").fill("Responsável Stripe teste");
  await page.getByLabel("E-mail do responsável", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("Missao-Stripe-2026-Teste!");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Criar conta do responsável" }).click();
  await page.getByLabel("Código de seis dígitos").waitFor();
  const code = await poll("verification code", () => Promise.resolve(otpFor(email)), Boolean);
  await page.getByLabel("Código de seis dígitos").fill(code);
  await page.getByRole("button", { name: "Confirmar e-mail", exact: true }).click();
  await page.waitForURL(`${origin}/familia`);

  const [user] = await sql`select id from core.users where email = ${email}`;
  if (!user) throw new Error("Local test account was not persisted");
  const frozenTime = Math.floor(Date.now() / 1000);
  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time: frozenTime,
    name: `Missão Saber ${runId.slice(0, 8)}`,
  });
  clockId = clock.id;
  const customer = await stripe.customers.create({
    email,
    name: "Responsável Stripe teste",
    test_clock: clockId,
    metadata: { app: "missao-saber", homologation_run: runId },
  });
  remoteCustomerId = customer.id;
  await sql`
    insert into billing.customers
      (id, provider, provider_customer_id, subject_type, subject_id, app, email, metadata)
    values
      (${randomUUID()}, 'stripe', ${remoteCustomerId}, 'user', ${user.id}, 'missao-saber', ${email}, ${sql.json({ homologationRun: runId })})
  `;

  // Exercise the real abandoned-checkout lifecycle before making the paid purchase.
  await page.getByRole("button", { name: "Escolher mensal" }).first().click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 });
  const openCheckouts = await stripe.checkout.sessions.list({
    customer: remoteCustomerId,
    status: "open",
    limit: 10,
  });
  const checkoutToExpire = openCheckouts.data[0];
  if (!checkoutToExpire) throw new Error("Stripe did not create the checkout to expire");
  await stripe.checkout.sessions.expire(checkoutToExpire.id);
  await replayRealProviderEvents(frozenTime - 60);
  await poll("expired checkout cleanup", checkoutIntentCount, (count) => count === 0);
  await page.goto(`${origin}/familia`);

  await page.getByRole("button", { name: "Escolher mensal" }).nth(1).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 });
  await page.locator("#cardNumber").fill("4242424242424242");
  await page.locator("#cardExpiry").fill("1234");
  await page.locator("#cardCvc").fill("123");
  if (await page.locator("#billingName").isVisible())
    await page.locator("#billingName").fill("Responsável Stripe teste");
  if (await page.locator("#billingPostalCode").isVisible())
    await page.locator("#billingPostalCode").fill("01310100");
  await page.getByTestId("hosted-payment-submit-button").click();
  await page.waitForURL(new RegExp(`${origin}/familia\\?pagamento=recebido`), {
    timeout: 60000,
  });
  await replayRealProviderEvents(frozenTime - 60);
  let local = await poll(
    "checkout webhook",
    localSubscription,
    (subscription) =>
      subscription?.status === "active" && subscription?.product_id === "missao_family_monthly",
  );
  const remoteSubscriptionId = local.provider_subscription_id;

  for (const nickname of ["Sol", "Lua", "Nina"]) {
    await page.goto(`${origin}/familia`);
    await page.getByLabel("Apelido do estudante").fill(nickname);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Criar perfil e explorar" }).click();
    await page.getByRole("heading", { name: `Olá, ${nickname}.` }).waitFor();
  }

  await page.goto(`${origin}/familia`);
  await page.getByRole("button", { name: "Gerenciar plano, pagamentos ou cancelamento" }).click();
  await page.waitForURL(/billing\.stripe\.com/, { timeout: 30000 });
  const portalOpened = page.url().startsWith("https://billing.stripe.com/");
  await page.goto(`${origin}/familia`);

  await page.getByLabel("Perfil que continuará ativo em um plano Individual").selectOption({
    label: "Lua",
  });
  await clickUntil(
    "initial scheduled capacity downgrade",
    page.getByRole("button", { name: "Mudar para Individual mensal no fim do período" }),
    (subscription) =>
      subscription?.pending_product_id === "missao_individual_monthly" &&
      Boolean(subscription?.cancel_at_period_end),
  );

  await clickUntil(
    "reactivation before choosing another plan",
    page.getByRole("button", { name: "Manter assinatura atual" }),
    (subscription) => !subscription?.pending_product_id && !subscription?.cancel_at_period_end,
  );
  const reactivatedRemote = await stripe.subscriptions.retrieve(remoteSubscriptionId);
  if (reactivatedRemote.cancel_at_period_end)
    throw new Error("Reactivation did not clear the scheduled provider cancellation");

  local = await clickUntil(
    "immediate annual plan change after reactivation",
    page.getByRole("button", { name: "Mudar para Família anual agora" }),
    (subscription) =>
      subscription?.product_id === "missao_family_annual" &&
      !subscription?.pending_product_id &&
      !subscription?.cancel_at_period_end,
  );
  const annualPeriodEnd = Math.floor(new Date(local.current_period_end).getTime() / 1000);

  await page.goto(`${origin}/familia`);
  await clickUntil(
    "scheduled capacity downgrade",
    page.getByRole("button", { name: "Mudar para Individual mensal no fim do período" }),
    (subscription) =>
      subscription?.pending_product_id === "missao_individual_monthly" &&
      Boolean(subscription?.cancel_at_period_end),
  );

  await advanceClock(annualPeriodEnd + 60);
  await replayRealProviderEvents(frozenTime - 60);
  const downgraded = await poll(
    "scheduled downgrade webhook",
    localSubscription,
    (subscription) =>
      subscription?.status === "active" &&
      subscription?.product_id === "missao_individual_monthly" &&
      subscription?.provider_subscription_id !== remoteSubscriptionId,
    120000,
  );
  const profileAccess = await sql`
    select nickname, access_enabled
      from missao_saber.profiles
     where user_id = ${user.id}
     order by created_at, id
  `;
  if (
    profileAccess.length !== 3 ||
    profileAccess
      .filter((profile) => profile.access_enabled)
      .map((profile) => profile.nickname)[0] !== "Lua" ||
    profileAccess.filter((profile) => profile.access_enabled).length !== 1
  )
    throw new Error(`Retained-profile state is invalid: ${JSON.stringify(profileAccess)}`);

  const downgradePeriodEnd = Math.floor(new Date(downgraded.current_period_end).getTime() / 1000);
  await stripe.subscriptions.update(downgraded.provider_subscription_id, {
    cancel_at_period_end: true,
  });
  await replayRealProviderEvents(frozenTime - 60);
  await poll("cancellation schedule webhook", localSubscription, (subscription) =>
    Boolean(subscription?.cancel_at_period_end),
  );
  await advanceClock(downgradePeriodEnd + 60);
  await replayRealProviderEvents(frozenTime - 60);
  const canceled = await poll(
    "cancellation webhook",
    localSubscription,
    (subscription) => subscription?.status === "canceled",
    120000,
  );
  await page.goto(`${origin}/familia`);
  await page.getByRole("heading", { name: "O aprendizado, mais de perto." }).waitFor();
  const exportResponse = await page.request.get(`${origin}/api/familia/exportar`);
  if (!exportResponse.ok())
    throw new Error(`Family export after cancellation returned ${exportResponse.status()}`);
  const exported = await exportResponse.json();
  if (exported.profiles?.length !== 3)
    throw new Error("Canceled account export lost profile history");
  await stripe.testHelpers.testClocks.del(clockId);
  clockId = "";

  // A separate real Stripe clock proves a paid renewal and a declined renewal
  // without disturbing the completed downgrade/cancellation scenario above.
  const lifecycleEmail = `ms-lifecycle-${runId.slice(0, 12)}@example.test`;
  const lifecycleUserId = randomUUID();
  await sql`
    insert into core.users (id, name, email, email_verified)
    values (${lifecycleUserId}, 'Responsável ciclo Stripe', ${lifecycleEmail}, true)
  `;
  const lifecycleFrozenTime = Math.floor(Date.now() / 1000);
  const lifecycleClock = await stripe.testHelpers.testClocks.create({
    frozen_time: lifecycleFrozenTime,
    name: `Missão Saber ciclo ${runId.slice(0, 8)}`,
  });
  clockId = lifecycleClock.id;
  const lifecycleCustomer = await stripe.customers.create({
    email: lifecycleEmail,
    name: "Responsável ciclo Stripe",
    test_clock: clockId,
    metadata: { app: "missao-saber", homologation_run: runId },
  });
  remoteCustomerId = lifecycleCustomer.id;
  await sql`
    insert into billing.customers
      (id, provider, provider_customer_id, subject_type, subject_id, app, email, metadata)
    values
      (${randomUUID()}, 'stripe', ${remoteCustomerId}, 'user', ${lifecycleUserId}, 'missao-saber', ${lifecycleEmail}, ${sql.json({ homologationRun: runId })})
  `;
  const validMethod = await stripe.paymentMethods.attach("pm_card_visa", {
    customer: remoteCustomerId,
  });
  await stripe.customers.update(remoteCustomerId, {
    invoice_settings: { default_payment_method: validMethod.id },
  });
  const lifecyclePrice = localEnv.MISSAO_FAMILY_MONTHLY_PRICE;
  if (!/^price_[A-Za-z0-9]+$/.test(lifecyclePrice ?? ""))
    throw new Error("The family monthly Stripe test price is not configured");
  const lifecycleRemote = await stripe.subscriptions.create({
    customer: remoteCustomerId,
    items: [{ price: lifecyclePrice, quantity: 1 }],
    default_payment_method: validMethod.id,
    metadata: {
      app: "missao-saber",
      subject_type: "user",
      subject_id: lifecycleUserId,
      product_id: "missao_family_monthly",
      homologation_run: runId,
    },
  });
  await replayRealProviderEvents(lifecycleFrozenTime - 60);
  const lifecycleInitial = await poll(
    "initial lifecycle subscription",
    localSubscription,
    (subscription) => subscription?.status === "active",
    120000,
  );
  const renewalPeriodEnd = Math.floor(
    new Date(lifecycleInitial.current_period_end).getTime() / 1000,
  );
  await advanceClock(renewalPeriodEnd + 60);
  await replayRealProviderEvents(lifecycleFrozenTime - 60);
  const renewed = await poll(
    "annual renewal webhook",
    localSubscription,
    (subscription) =>
      subscription?.status === "active" &&
      new Date(subscription.current_period_end).getTime() > renewalPeriodEnd * 1000,
    120000,
  );

  await advanceClock((await waitForClock()).frozen_time + 300);
  const failingMethod = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", {
    customer: remoteCustomerId,
  });
  await stripe.subscriptions.update(lifecycleRemote.id, {
    default_payment_method: failingMethod.id,
  });
  const failurePeriodEnd = Math.floor(new Date(renewed.current_period_end).getTime() / 1000);
  await advanceClock(failurePeriodEnd + 60);
  await replayRealProviderEvents(frozenTime - 60);
  const failed = await poll(
    "failed renewal webhook",
    localSubscription,
    (subscription) =>
      ["past_due", "unpaid"].includes(subscription?.status) ||
      (subscription?.status === "canceled" && subscription?.metadata?.dunning?.pending === true),
    120000,
  );
  await stripe.testHelpers.testClocks.del(clockId);
  clockId = "";

  const result = {
    runId,
    mode: "test",
    checkout: "active",
    portal: portalOpened ? "opened" : "failed",
    expiredCheckout: "released",
    immediatePlanChange: "family_annual",
    scheduledChangeReactivated: "provider_cancellation_cleared_then_upgraded",
    scheduledDowngrade: "individual_monthly_applied",
    renewal: "paid",
    paymentFailure: `${failed.status}_access_revoked`,
    cancellation: `${canceled.status}_history_and_export_preserved`,
    retainedProfile: "Lua",
    profiles: 3,
    clockCleaned: true,
  };
  writeFileSync(
    resolve(outputDirectory, "stripe-provider-homologation.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  console.log(JSON.stringify(result));
} catch (error) {
  if (browser) {
    const pages = browser.contexts().flatMap((context) => context.pages());
    const page = pages.at(-1);
    if (page)
      await page.screenshot({
        path: resolve(outputDirectory, "stripe-provider-failure.png"),
        fullPage: true,
      });
  }
  throw error;
} finally {
  await browser?.close();
  if (clockId) await stripe.testHelpers.testClocks.del(clockId).catch(() => undefined);
  await sql.end();
}
