import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createStripePaymentFactReader } from "../../packages/billing/src/payment-facts";
import { PRODUCTS } from "../../packages/config/src/products";

// Resolve the SDK owned and pinned by billing, without a second dependency.
const requireBilling = createRequire(
  new URL("../../packages/billing/package.json", import.meta.url),
);
const Stripe = requireBilling("stripe");
const STRIPE_API_VERSION = "2026-04-22.dahlia";
const marker = "compasso-v1";
const CONTA_ORIGIN = "https://conta.informach.com.br";
/** Everything the Conta reconciles: checkout, subscription, invoice, payment,
 * refund/dispute and native schedules. The handler stores minimal
 * identifiers and requests reconciliation; it never trusts these payloads. */
export const COMPASSO_STRIPE_EVENTS = [
  "checkout.session.completed",
  "checkout.session.expired",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "invoice.voided",
  "invoice.marked_uncollectible",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "subscription_schedule.created",
  "subscription_schedule.updated",
  "subscription_schedule.released",
  "subscription_schedule.canceled",
  "subscription_schedule.completed",
];

/** Without `apply`, only reads and reports the changes it would make. */
export async function provisionCompassoStripe(options: {
  secretKey: string;
  mode: "dev" | "prod";
  apply: boolean;
  webhookUrl?: string;
  secretsOutput?: string;
}) {
  const live = options.mode === "prod";
  assert.ok(
    (live ? /^(sk|rk)_live_/ : /^(sk|rk)_test_/).test(options.secretKey),
    "Stripe key does not match the requested mode",
  );
  if (options.webhookUrl) {
    const url = new URL(options.webhookUrl);
    assert.equal(url.protocol, "https:");
    assert.equal(url.pathname, "/api/webhooks/stripe");
    assert.equal(url.search, "");
    assert.equal(url.hash, "");
    if (live) assert.equal(url.origin, CONTA_ORIGIN);
  }
  if (options.secretsOutput) {
    const path = resolve(options.secretsOutput);
    const inRepository = relative(fileURLToPath(new URL("../../", import.meta.url)), path);
    assert.ok(
      isAbsolute(inRepository) || inRepository.split(sep)[0] === "..",
      "Webhook secrets must be saved outside the repository",
    );
  }
  const stripe = new Stripe(options.secretKey, {
    apiVersion: STRIPE_API_VERSION,
    timeout: 30000,
    maxNetworkRetries: 2,
  });
  const expectedProducts = PRODUCTS.filter((entry) => entry.app === "compasso");
  assert.equal(expectedProducts.length, 5, "The approved Compasso catalog has five prices");
  const changes: string[] = [];
  // Shown on Checkout, invoices and the portal. Dia de Estrela is left out of
  // the copy until the owner decides to announce it.
  const description =
    "Os apps web da Informach para a família numa assinatura só: Cozya, Agenda da Turma, Missão Saber e Bora Treinar. Até dois adultos e quatro dependentes, 200 créditos de IA por mês compartilhados entre os apps e recargas de créditos sem vencimento.";
  const image = readFileSync(new URL("./assets/compasso-produto.png", import.meta.url));
  const imageHash = createHash("sha256").update(image).digest("hex").slice(0, 16);
  async function uploadImage() {
    const form = new FormData();
    form.set("purpose", "business_icon");
    form.set("file", new Blob([image], { type: "image/png" }), "compasso.png");
    form.set("file_link_data[create]", "true");
    form.set("file_link_data[metadata][app]", "compasso");
    const response = await fetch("https://files.stripe.com/v1/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.secretKey}`,
        "Stripe-Version": STRIPE_API_VERSION,
        "Idempotency-Key": `${marker}:image:${options.mode}:${imageHash}`,
      },
      body: form,
      signal: AbortSignal.timeout(30000),
    });
    const file = (await response.json()) as { links?: { data?: { url?: string }[] } };
    if (!response.ok) throw new Error(`Stripe image upload failed with ${response.status}`);
    const url = file.links?.data?.[0]?.url;
    assert.ok(url, "Stripe did not return a public link for the product image");
    const check = await fetch(url, { signal: AbortSignal.timeout(15000) });
    assert.ok(
      check.ok && check.headers.get("content-type")?.startsWith("image/"),
      "Stripe product image is not publicly readable",
    );
    return url;
  }
  const nickname = (entry: (typeof expectedProducts)[number]) =>
    entry.kind === "credit_pack"
      ? `Compasso, ${entry.creditAmount} créditos`
      : entry.interval === "year"
        ? "Compasso anual"
        : "Compasso mensal";
  const found = [];
  for await (const candidate of stripe.products.list({ limit: 100 }))
    if (candidate.metadata.app === "compasso") found.push(candidate);
  assert.ok(found.length <= 1, "Multiple Compasso products require review before provisioning");
  let product = found[0];
  if (!product) {
    changes.push("create_compasso_product");
    if (options.apply)
      product = await stripe.products.create(
        {
          name: "Compasso",
          description,
          metadata: { app: "compasso", catalog: marker, image: imageHash },
        },
        { idempotencyKey: `${marker}:product` },
      );
  }
  if (product) assert.ok(product.active, "The existing Compasso product is inactive");
  if (
    product &&
    (product.description !== description ||
      product.metadata.image !== imageHash ||
      product.images.length !== 1)
  ) {
    changes.push("update_compasso_product_copy_and_image");
    if (options.apply)
      product = await stripe.products.update(product.id, {
        description,
        images: [await uploadImage()],
        metadata: { ...product.metadata, image: imageHash },
      });
  }
  const prices: Record<string, string> = {};
  for (const expected of expectedProducts) {
    assert.ok(expected.listPrice);
    const recurring = expected.kind === "subscription";
    if (recurring) assert.ok(expected.interval);
    const lookupKey = `informach_${expected.id}_v1`;
    const listed = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 100 });
    assert.ok(listed.data.length <= 1);
    let price = listed.data[0];
    if (!price) {
      changes.push(`create_${expected.id}_price`);
      if (options.apply) {
        assert.ok(product);
        price = await stripe.prices.create(
          {
            product: product.id,
            currency: expected.listPrice.currency.toLowerCase(),
            unit_amount: expected.listPrice.amountCents,
            ...(recurring && expected.interval
              ? { recurring: { interval: expected.interval } }
              : {}),
            lookup_key: lookupKey,
            nickname: nickname(expected),
            metadata: { app: "compasso", catalog: marker, product_id: expected.id },
          },
          { idempotencyKey: `${marker}:price:${expected.id}` },
        );
      }
    }
    if (price && price.nickname !== nickname(expected)) {
      changes.push(`name_${expected.id}_price`);
      if (options.apply)
        price = await stripe.prices.update(price.id, { nickname: nickname(expected) });
    }
    if (price) {
      assert.equal(price.product, product?.id);
      assert.equal(price.active, true);
      assert.equal(price.livemode, live);
      assert.equal(price.unit_amount, expected.listPrice.amountCents);
      assert.equal(price.currency, expected.listPrice.currency.toLowerCase());
      if (recurring) {
        assert.equal(price.recurring?.interval, expected.interval);
        assert.equal(price.recurring?.interval_count, 1);
      } else assert.equal(price.recurring, null);
      prices[expected.id] = price.id;
    }
  }
  const portals = [];
  for await (const candidate of stripe.billingPortal.configurations.list({ limit: 100 }))
    if (candidate.metadata.app === "compasso") portals.push(candidate);
  assert.ok(portals.length <= 1, "Multiple Compasso portal configurations require review");
  let portal = portals[0];
  if (!portal) {
    changes.push("create_restricted_compasso_portal");
    if (options.apply)
      // Payment method and receipts only: cancellation and plan changes pass
      // through the Conta, which serializes them with family participation.
      portal = await stripe.billingPortal.configurations.create(
        {
          business_profile: { headline: "Pagamento e comprovantes do Compasso" },
          default_return_url: `${CONTA_ORIGIN}/#compasso`,
          metadata: { app: "compasso", catalog: marker },
          features: {
            customer_update: { enabled: false },
            invoice_history: { enabled: true },
            payment_method_update: { enabled: true },
            subscription_cancel: { enabled: false },
            subscription_update: { enabled: false },
          },
        },
        { idempotencyKey: `${marker}:portal` },
      );
  }
  if (portal && Object.keys(prices).length === expectedProducts.length)
    await createStripePaymentFactReader({
      secretKey: options.secretKey,
      client: stripe,
    }).verifyCompassoCatalog(
      expectedProducts.map((entry) => ({
        ...entry,
        stripePriceId: { dev: prices[entry.id] ?? "", prod: prices[entry.id] ?? "" },
      })),
      options.mode,
      portal.id,
    );
  let webhookId: string | undefined;
  if (options.webhookUrl) {
    const endpoints = [];
    for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 }))
      if (endpoint.url === options.webhookUrl || endpoint.metadata.app === "compasso")
        endpoints.push(endpoint);
    assert.ok(endpoints.length <= 1, "Multiple Compasso webhook endpoints require review");
    let endpoint = endpoints[0];
    if (!endpoint) {
      changes.push("create_compasso_webhook");
      if (options.apply) {
        assert.ok(
          options.secretsOutput,
          "New webhook requires --secrets-output outside the repository",
        );
        endpoint = await stripe.webhookEndpoints.create(
          {
            url: options.webhookUrl,
            api_version: STRIPE_API_VERSION,
            enabled_events: COMPASSO_STRIPE_EVENTS,
            description: "Compasso billing events for the Conta",
            metadata: { app: "compasso", catalog: marker },
          },
          { idempotencyKey: `${marker}:webhook:${options.webhookUrl}` },
        );
        assert.ok(endpoint.secret);
        await writeFile(options.secretsOutput, `STRIPE_WEBHOOK_SECRET=${endpoint.secret}\n`, {
          flag: "wx",
          mode: 0o600,
        });
      }
    }
    if (endpoint) {
      assert.equal(endpoint.url, options.webhookUrl);
      assert.equal(endpoint.api_version, STRIPE_API_VERSION);
      assert.equal(endpoint.status, "enabled");
      assert.equal(endpoint.livemode, live);
      assert.deepEqual([...endpoint.enabled_events].sort(), [...COMPASSO_STRIPE_EVENTS].sort());
      webhookId = endpoint.id;
    }
  }
  return {
    mode: options.mode,
    applied: options.apply,
    changes,
    productId: product?.id,
    // Public identifiers for the Conta service variables.
    variables: Object.fromEntries(
      expectedProducts.flatMap((entry) =>
        entry.stripePriceEnvironmentVariable && prices[entry.id]
          ? [[entry.stripePriceEnvironmentVariable, prices[entry.id]]]
          : [],
      ),
    ),
    portalConfigurationId: portal?.id,
    webhookId,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const mode = value("--mode") ?? "dev";
  assert.ok(mode === "dev" || mode === "prod", "Use --mode dev or --mode prod");
  try {
    console.log(
      JSON.stringify(
        await provisionCompassoStripe({
          secretKey: process.env.STRIPE_SECRET_KEY ?? "",
          mode,
          apply: args.includes("--apply"),
          webhookUrl: value("--webhook-url"),
          secretsOutput: value("--secrets-output"),
        }),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Stripe provisioning failed");
    process.exitCode = 1;
  }
}
