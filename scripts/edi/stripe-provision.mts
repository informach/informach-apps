import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createStripePaymentFactReader } from "../../packages/billing/src/payment-facts";
import { PRODUCTS } from "../../packages/config/src/products";

// Resolve the SDK owned and pinned by billing, without a second dependency/version.
const requireBilling = createRequire(
  new URL("../../packages/billing/package.json", import.meta.url),
);
export const Stripe = requireBilling("stripe");
export const STRIPE_API_VERSION = "2026-04-22.dahlia";
const marker = "edi-suite-v2";
export const EDI_STRIPE_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
];

export async function provisionEdiStripe(options: {
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
    if (live) assert.equal(url.origin, "https://edi.informach.com.br");
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
  const changes: string[] = [];
  const products = [];
  for await (const candidate of stripe.products.list({ limit: 100 }))
    if (candidate.metadata.app === "edi") products.push(candidate);
  assert.ok(products.length <= 1, "Multiple Edi products require review before provisioning");
  let product = products[0];
  if (!product) {
    changes.push("create_suite_product");
    if (options.apply)
      product = await stripe.products.create(
        {
          name: "Suíte Edi",
          description:
            "Cinco ferramentas criativas, até dois dispositivos e atualizações. Consumo pago de IA não incluído.",
          metadata: { app: "edi", catalog: marker },
        },
        { idempotencyKey: `${marker}:product` },
      );
  }
  if (product) assert.ok(product.active, "The existing Edi product is inactive");
  const prices: Record<string, string> = {};
  for (const expected of PRODUCTS.filter((entry) => entry.app === "edi")) {
    assert.ok(expected.listPrice && expected.interval);
    const lookupKey = `informach_${expected.id}_v2`;
    const found = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 100 });
    assert.ok(found.data.length <= 1);
    let price = found.data[0];
    if (!price) {
      changes.push(`create_${expected.id}_price`);
      if (options.apply) {
        assert.ok(product);
        price = await stripe.prices.create(
          {
            product: product.id,
            currency: expected.listPrice.currency.toLowerCase(),
            unit_amount: expected.listPrice.amountCents,
            recurring: { interval: expected.interval },
            lookup_key: lookupKey,
            metadata: { app: "edi", catalog: marker, product_id: expected.id },
          },
          { idempotencyKey: `${marker}:price:${expected.id}` },
        );
      }
    }
    if (price) {
      assert.equal(price.product, product?.id);
      assert.equal(price.active, true);
      assert.equal(price.livemode, live);
      assert.equal(price.unit_amount, expected.listPrice.amountCents);
      assert.equal(price.currency, expected.listPrice.currency.toLowerCase());
      assert.equal(price.recurring?.interval, expected.interval);
      assert.equal(price.recurring?.interval_count, 1);
      prices[expected.id] = price.id;
    }
  }
  const portals = [];
  for await (const candidate of stripe.billingPortal.configurations.list({ limit: 100 }))
    if (candidate.metadata.app === "edi") portals.push(candidate);
  assert.ok(portals.length <= 1, "Multiple Edi portal configurations require review");
  let portal = portals[0];
  if (!portal) {
    changes.push("create_restricted_suite_portal");
    if (options.apply) {
      assert.ok(product);
      portal = await stripe.billingPortal.configurations.create(
        {
          business_profile: { headline: "Gerencie sua assinatura da Suíte Edi" },
          default_return_url: "https://edi.informach.com.br/conta",
          metadata: { app: "edi", catalog: marker },
          features: {
            customer_update: {
              enabled: true,
              allowed_updates: ["email", "name", "address", "tax_id"],
            },
            invoice_history: { enabled: true },
            payment_method_update: { enabled: true },
            subscription_cancel: {
              enabled: true,
              mode: "at_period_end",
              proration_behavior: "none",
            },
            subscription_update: {
              enabled: true,
              default_allowed_updates: ["price"],
              proration_behavior: "always_invoice",
              products: [{ product: product.id, prices: Object.values(prices) }],
            },
          },
        },
        { idempotencyKey: `${marker}:portal` },
      );
    }
  }
  if (portal && Object.keys(prices).length === 2) {
    await createStripePaymentFactReader({
      secretKey: options.secretKey,
      client: stripe,
    }).verifyCatalog(
      PRODUCTS.filter((entry) => entry.app === "edi").map((entry) => ({
        ...entry,
        stripePriceId: { dev: prices[entry.id] ?? "", prod: prices[entry.id] ?? "" },
      })),
      options.mode,
      portal.id,
    );
    assert.equal(portal.features.subscription_cancel.mode, "at_period_end");
  }
  let webhookId: string | undefined;
  if (options.webhookUrl) {
    const endpoints = [];
    for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 }))
      if (endpoint.url === options.webhookUrl || endpoint.metadata.app === "edi")
        endpoints.push(endpoint);
    assert.ok(endpoints.length <= 1, "Multiple Edi webhook endpoints require review");
    let endpoint = endpoints[0];
    if (!endpoint) {
      changes.push("create_snapshot_webhook");
      if (options.apply) {
        assert.ok(
          options.secretsOutput,
          "New webhook requires --secrets-output outside the repository",
        );
        endpoint = await stripe.webhookEndpoints.create(
          {
            url: options.webhookUrl,
            api_version: STRIPE_API_VERSION,
            enabled_events: EDI_STRIPE_EVENTS,
            description: "Edi suite snapshot billing events",
            metadata: { app: "edi", catalog: marker },
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
      assert.deepEqual([...endpoint.enabled_events].sort(), [...EDI_STRIPE_EVENTS].sort());
      webhookId = endpoint.id;
    }
  }
  return {
    mode: options.mode,
    applied: options.apply,
    changes,
    productId: product?.id,
    prices,
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
        await provisionEdiStripe({
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
