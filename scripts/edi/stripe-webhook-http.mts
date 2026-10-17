import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import {
  withBillingLifecycle,
  withCustomerBillingLifecycle,
} from "../../apps/edi/src/features/billing/lifecycle";
import { reconcileBilling } from "../../apps/edi/src/features/billing/reconciliation";
import { handleStripeWebhook } from "../../apps/edi/src/features/billing/webhook-handler";
import { createBillingService, WebhookSignatureError } from "../../packages/billing/src/index";
import { createStripePaymentFactReader } from "../../packages/billing/src/payment-facts";
import { PRODUCTS } from "../../packages/config/src/products";
import { db, eq } from "../../packages/db/src/index";
import { customers, ediEntitlements, users } from "../../packages/db/src/schema/index";
import { EDI_STRIPE_EVENTS, STRIPE_API_VERSION } from "./stripe-provision.mts";

const url = new URL(process.env.DATABASE_URL ?? "");
assert.ok(
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: Operational harness runs outside Turbo with a disposable database.
  process.env.EDI_ISOLATED_DATABASE === "1" && ["127.0.0.1", "localhost"].includes(url.hostname),
  "HTTP webhook verification requires the disposable loopback database",
);
// biome-ignore lint/suspicious/noUndeclaredEnvVars: Opt-in provider credential is supplied only to this uncached operational harness.
const testKey = process.env.EDI_STRIPE_TEST_KEY ?? "";
assert.ok(/^(sk|rk)_test_/.test(testKey), "EDI_STRIPE_TEST_KEY must be a test-mode key");
const cliEnv = { ...process.env, STRIPE_API_KEY: testKey };
const runId = randomUUID();
function cli(args: string[]) {
  const result = spawnSync("stripe", [...args, "--stripe-version", STRIPE_API_VERSION], {
    env: cliEnv,
    encoding: "utf8",
    windowsHide: true,
    timeout: 45000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`Stripe CLI ${args.slice(0, 2).join(" ")} failed (${result.status})`);
  // Destructive CLI operations print a confirmation banner even with --confirm.
  const jsonStart = result.stdout.indexOf("{");
  assert.ok(jsonStart >= 0, "Stripe CLI returned no JSON response");
  const response = JSON.parse(result.stdout.slice(jsonStart));
  if (response.error)
    throw new Error(
      `Stripe CLI rejected ${args.slice(0, 2).join(" ")}: ${response.error.code ?? response.error.type}`,
    );
  return response;
}
const prices: Record<string, string> = {};
for (const product of PRODUCTS.filter((entry) => entry.app === "edi")) {
  const response = cli([
    "prices",
    "list",
    "-d",
    `lookup_keys[0]=informach_${product.id}_v2`,
    "--limit",
    "2",
  ]);
  assert.equal(response.data.length, 1);
  assert.equal(response.data[0].livemode, false);
  prices[product.id] = response.data[0].id;
}
const products = PRODUCTS.filter((entry) => entry.app === "edi").map((entry) => ({
  ...entry,
  stripePriceId: { dev: prices[entry.id] ?? "", prod: "" },
}));
let handler: ((request: Request) => Promise<unknown>) | undefined;
const delivered: { id: string; type: string; objectId: string; apiVersion: string }[] = [];
const httpErrors: string[] = [];
const server = createServer(async (request, response) => {
  try {
    if (!handler) {
      response.writeHead(503).end();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 1048576) {
        response.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    const signature = request.headers["stripe-signature"];
    const result = await handler(
      new Request(`http://127.0.0.1${request.url}`, {
        method: "POST",
        headers: { "stripe-signature": typeof signature === "string" ? signature : "" },
        body: raw,
      }),
    );
    // Read evidence only after the production handler has verified the raw body.
    const event = JSON.parse(raw);
    delivered.push({
      id: event.id,
      type: event.type,
      objectId: event.data.object.id,
      apiVersion: event.api_version,
    });
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(result));
  } catch (error) {
    if (error instanceof WebhookSignatureError) {
      response.writeHead(400).end();
      return;
    }
    httpErrors.push(error instanceof Error ? error.name : "unknown");
    response.writeHead(503).end();
  }
});
await new Promise<void>((done, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", done);
});
const address = server.address();
assert.ok(address && typeof address !== "string");
const target = `http://127.0.0.1:${address.port}/api/webhooks/stripe`;
const listener = spawn(
  "stripe",
  [
    "listen",
    "--latest",
    "--skip-update",
    "--events",
    EDI_STRIPE_EVENTS.join(","),
    "--forward-to",
    target,
  ],
  {
    env: cliEnv,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let customerId: string | undefined;
let failure: unknown;
async function until(description: string, condition: () => boolean) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (condition()) return;
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${description}`);
}
try {
  const signingSecret = await new Promise<string>((done, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Stripe CLI listener did not become ready")),
      30000,
    );
    let output = "";
    const receive = (chunk: Buffer) => {
      output = (output + chunk.toString("utf8")).slice(-65536);
      const secret = output.match(/whsec_[A-Za-z0-9]+/)?.[0];
      if (secret) {
        clearTimeout(timeout);
        done(secret);
      }
    };
    listener.stdout.on("data", receive);
    listener.stderr.on("data", receive);
    listener.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    listener.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Stripe CLI listener exited (${code})`));
    });
  });
  const reader = createStripePaymentFactReader({ secretKey: testKey });
  const billing = createBillingService({
    provider: "stripe",
    stripeSecretKey: testKey,
    stripeWebhookSecret: signingSecret,
    db,
    app: "edi",
    appName: "Edi HTTP homologation",
    publicAppUrl: "http://localhost:3006",
    products,
    organizationsEnabled: false,
    stripeMode: "dev",
    guardClosedBilling: true,
    managedCheckout: true,
    withSubjectLock: (subject, operation) => withBillingLifecycle(subject.id, operation),
    resolveSubjectEmail: async (subject) => `${subject.id}@example.invalid`,
  });
  handler = (request) => handleStripeWebhook(request, { billing, reader });
  const userId = randomUUID();
  await db
    .insert(users)
    .values({ id: userId, name: "Edi HTTP homologation", email: `${userId}@example.invalid` });
  const customer = cli([
    "customers",
    "create",
    "--name",
    "Edi HTTP homologation",
    "-d",
    "metadata[app]=edi",
    "-d",
    `metadata[edi_homologation]=${runId}`,
  ]);
  assert.equal(customer.livemode, false);
  customerId = customer.id;
  await db.insert(customers).values({
    app: "edi",
    provider: "stripe",
    providerCustomerId: customer.id,
    subjectType: "user",
    subjectId: userId,
    email: `${userId}@example.invalid`,
  });
  const paymentMethod = cli([
    "payment_methods",
    "attach",
    "pm_card_visa",
    "--customer",
    customer.id,
  ]);
  const subscription = cli([
    "subscriptions",
    "create",
    "--customer",
    customer.id,
    "-d",
    `items[0][price]=${prices.edi_suite_monthly}`,
    "-d",
    `default_payment_method=${paymentMethod.id}`,
    "-d",
    "payment_behavior=error_if_incomplete",
    "-d",
    "metadata[app]=edi",
    "-d",
    "metadata[product_id]=edi_suite_monthly",
    "-d",
    `metadata[edi_homologation]=${runId}`,
  ]);
  assert.equal(subscription.status, "active");
  await until("signed Stripe subscription webhook over HTTP", () =>
    delivered.some(
      (event) =>
        event.type === "customer.subscription.created" && event.objectId === subscription.id,
    ),
  );
  const reconcile = async () => {
    const errors: unknown[] = [];
    const result = await reconcileBilling({
      reader,
      products,
      mode: "dev",
      withCustomerLock: withCustomerBillingLifecycle,
      onError: (_id, error) => errors.push(error),
    });
    if (errors.length) throw errors[0];
    assert.ok(result.processed > 0);
  };
  await reconcile();
  const entitlement = async () =>
    (await db.select().from(ediEntitlements).where(eq(ediEntitlements.userId, userId)))[0];
  assert.ok((await entitlement())?.paidThrough);
  await until("paid invoice webhook over HTTP", () =>
    delivered.some(
      (event) => event.type === "invoice.paid" && event.objectId === subscription.latest_invoice,
    ),
  );
  const payments = cli([
    "invoice_payments",
    "list",
    "-d",
    `invoice=${subscription.latest_invoice}`,
    "-d",
    "status=paid",
  ]);
  const intent = payments.data[0]?.payment.payment_intent;
  assert.ok(typeof intent === "string");
  const refund = cli(["refunds", "create", "--payment-intent", intent]);
  assert.equal(refund.status, "succeeded");
  await until("signed Stripe refund webhook over HTTP", () =>
    delivered.some((event) => event.type === "charge.refunded" && event.objectId === refund.charge),
  );
  assert.equal((await entitlement())?.suspended, true);
  await reconcile();
  assert.equal((await entitlement())?.paidThrough, null);
  const receivedBefore = delivered.length;
  const invalid = await fetch(target, {
    method: "POST",
    body: "{}",
    headers: { "stripe-signature": "invalid" },
  });
  assert.equal(invalid.status, 400);
  assert.equal(delivered.length, receivedBefore);
  assert.deepEqual(httpErrors, []);
  console.log(
    JSON.stringify(
      {
        runId,
        mode: "test",
        transport: "Stripe CLI listen to loopback HTTP",
        apiVersion: STRIPE_API_VERSION,
        webhookApiVersions: [...new Set(delivered.map((event) => event.apiVersion))],
        receivedTypes: [...new Set(delivered.map((event) => event.type))],
        checks: [
          "authentic_http_signature",
          "first_payment_grants_access",
          "refund_suspends_then_revokes",
          "invalid_signature_rejected",
        ],
        liveEndpointUsed: false,
      },
      null,
      2,
    ),
  );
} catch (error) {
  failure = error;
} finally {
  listener.kill();
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
  if (customerId) {
    try {
      const customer = cli(["customers", "retrieve", customerId]);
      assert.equal(customer.metadata.edi_homologation, runId);
      assert.equal(customer.livemode, false);
      cli(["customers", "delete", customerId, "--confirm"]);
    } catch (error) {
      failure ??= error;
    }
  }
  await (
    globalThis as typeof globalThis & {
      __informachPg?: { end: (options: { timeout: number }) => Promise<void> };
    }
  ).__informachPg?.end({ timeout: 5 });
}
if (failure) {
  console.error(failure instanceof Error ? failure.message : "HTTP Stripe verification failed");
  process.exitCode = 1;
}
