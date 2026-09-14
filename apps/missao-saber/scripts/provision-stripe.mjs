import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { parse } from "dotenv";

const root = resolve(import.meta.dirname, "../../..");
const requireBilling = createRequire(resolve(root, "packages/billing/package.json"));
const Stripe = requireBilling("stripe");
const local = parse(readFileSync(resolve(root, "apps/cozya/.env.local")));
const mode = process.argv[2];
if (!["dev", "prod"].includes(mode)) throw new Error("Choose dev or prod");
const key = mode === "prod" ? local.STRIPE_PROD_SECRET_KEY : local.STRIPE_SECRET_KEY;
if (!key || !(mode === "prod" ? /^(sk|rk)_live_/ : /^(sk|rk)_test_/).test(key))
  throw new Error("Stripe key mode mismatch");
const stripe = new Stripe(key, { apiVersion: "2026-04-22.dahlia", timeout: 30000 });
const domain =
  mode === "prod"
    ? (process.env.MISSAO_PUBLIC_ORIGIN ?? "https://missao-saber.informach.com.br")
    : "http://localhost:3005";
const app = "missao-saber";
const plans = [
  ["individual", "Individual", 2990, 29900],
  ["family", "Família", 4490, 44900],
];
let stage = "starting";
try {
  stage = "uploading icon file";
  const iconData = readFileSync(resolve(root, "apps/missao-saber/public/app-icon.png"));
  const iconHash = createHash("sha256").update(iconData).digest("hex").slice(0, 16);
  const iconForm = new FormData();
  iconForm.set("purpose", "business_icon");
  iconForm.set("file", new Blob([iconData], { type: "image/png" }), "missao-saber.png");
  iconForm.set("file_link_data[create]", "true");
  iconForm.set("file_link_data[metadata][app]", app);
  const iconResponse = await fetch("https://files.stripe.com/v1/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Stripe-Version": "2026-04-22.dahlia",
      "Idempotency-Key": `missao-icon-${mode}-${iconHash}`,
    },
    body: iconForm,
    signal: AbortSignal.timeout(30000),
  });
  const iconFile = await iconResponse.json();
  if (!iconResponse.ok)
    throw new Error(`Stripe file upload ${iconResponse.status}: ${iconFile.error?.message}`);
  const iconUrl = iconFile.links?.data[0]?.url;
  if (!iconUrl) throw new Error("Stripe did not return a permanent icon link");
  const iconCheck = await fetch(iconUrl, { signal: AbortSignal.timeout(15000) });
  if (!iconCheck.ok || !iconCheck.headers.get("content-type")?.startsWith("image/"))
    throw new Error("Stripe product icon is not publicly readable");
  const catalog = [];
  for (const [tier, label, month, year] of plans) {
    stage = `provisioning ${tier} product`;
    const productId = `missao_saber_${tier}`;
    let product;
    try {
      product = await stripe.products.retrieve(productId);
    } catch (error) {
      if (error.code !== "resource_missing") throw error;
      product = await stripe.products.create({
        id: productId,
        name: `Missão Saber ${label}`,
        metadata: { app, kind: "subscription", tier },
      });
    }
    product = await stripe.products.update(product.id, {
      name: `Missão Saber ${label}`,
      description:
        tier === "individual"
          ? "Um espaço para aprender e se preparar para as olimpíadas escolares. Inclui um perfil de estudante, com desafios autorais, explicações passo a passo, revisões e acompanhamento pela família."
          : "Aprender fica ainda melhor em família. Inclui até três perfis de estudantes, cada um com seu progresso, desafios autorais, explicações passo a passo e revisões para as olimpíadas escolares.",
      images: [iconUrl],
    });
    const ids = [];
    for (const [interval, suffix, amount] of [
      ["month", "monthly", month],
      ["year", "annual", year],
    ]) {
      const lookup = `missao_${tier}_${suffix}`;
      const current = await stripe.prices.list({ lookup_keys: [lookup], active: true });
      const price =
        current.data[0] ??
        (await stripe.prices.create({
          product: product.id,
          currency: "brl",
          unit_amount: amount,
          recurring: { interval },
          lookup_key: lookup,
          tax_behavior: "inclusive",
          metadata: { app, product_id: lookup },
        }));
      if (
        price.unit_amount !== amount ||
        price.currency !== "brl" ||
        price.recurring?.interval !== interval ||
        price.product !== product.id
      )
        throw new Error("Existing Stripe price does not match catalog");
      ids.push(price.id);
      catalog.push({
        variable: `MISSAO_${tier.toUpperCase()}_${suffix.toUpperCase()}_PRICE`,
        priceId: price.id,
        productId: product.id,
        amount,
        interval,
      });
    }
  }
  const configurations = await stripe.billingPortal.configurations.list({ limit: 100 });
  stage = "configuring billing portal";
  let portal = configurations.data.find((item) => item.metadata?.app === app);
  const config = {
    business_profile: {
      headline: "Gerencie sua assinatura do Missão Saber",
      privacy_policy_url: `${domain}/privacidade`,
      terms_of_service_url: `${domain}/termos`,
    },
    default_return_url: `${domain}/familia`,
    metadata: { app },
    features: {
      customer_update: { enabled: true, allowed_updates: ["email", "name", "address"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      // Plan changes stay in the app, where downgrade timing and the retained
      // student profile are enforced atomically with the local entitlement.
      subscription_update: { enabled: false },
    },
  };
  portal = portal
    ? await stripe.billingPortal.configurations.update(portal.id, config)
    : await stripe.billingPortal.configurations.create(config, {
        idempotencyKey: `missao-portal-${mode}-v1`,
      });
  const endpointUrl = `${domain}/api/webhooks/stripe`;
  stage = "configuring webhook";
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  let endpoint = endpoints.data.find((item) => item.url === endpointUrl);
  if (mode === "dev") {
    for (const remote of endpoints.data.filter((item) => item.metadata?.app === app))
      await stripe.webhookEndpoints.del(remote.id);
    endpoint = undefined;
  }
  if (mode === "prod" && !endpoint)
    endpoint = await stripe.webhookEndpoints.create(
      {
        url: endpointUrl,
        api_version: "2026-04-22.dahlia",
        enabled_events: [
          "checkout.session.completed",
          "checkout.session.expired",
          "customer.subscription.created",
          "customer.subscription.updated",
          "customer.subscription.deleted",
          "invoice.paid",
          "invoice.payment_failed",
        ],
        metadata: { app },
      },
      { idempotencyKey: `missao-webhook-${mode}-v1` },
    );
  const output = {
    mode,
    catalog,
    portalId: portal.id,
    webhookId: endpoint?.id ?? null,
    url: mode === "prod" ? endpointUrl : "Stripe CLI -> localhost:3005/api/webhooks/stripe",
  };
  const directory = resolve(root, "apps/missao-saber/tmp/production");
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, `stripe-${mode}.json`), JSON.stringify(output, null, 2));
  // Signing secret goes straight to the service, never to disk or logs.
  if (mode === "prod") {
    const { spawnSync } = await import("node:child_process");
    const values = Object.fromEntries(catalog.map((p) => [p.variable, p.priceId]));
    values.STRIPE_PORTAL_CONFIGURATION_ID = portal.id;
    if (endpoint?.secret) values.STRIPE_WEBHOOK_SECRET = endpoint.secret;
    const result = spawnSync(
      "python",
      [
        "-c",
        "import sys,json;sys.path.insert(0,'apps/missao-saber/scripts');import production as p;p.set_variables(p.SERVICE,json.load(sys.stdin));print('Stripe configuration saved to Railway')",
      ],
      { cwd: root, input: JSON.stringify(values), encoding: "utf8", windowsHide: true },
    );
    if (result.status !== 0)
      throw new Error(
        "Unable to store Stripe configuration; inspect service state before rerunning",
      );
  }
  if (mode === "dev") {
    const { execFileSync } = await import("node:child_process");
    const signingSecret = execFileSync("stripe", ["listen", "--print-secret"], {
      env: { ...process.env, STRIPE_API_KEY: key },
      encoding: "utf8",
      windowsHide: true,
    }).trim();
    if (!signingSecret.startsWith("whsec_"))
      throw new Error("Unable to obtain local Stripe CLI signing secret");
    const path = resolve(root, "apps/missao-saber/.env.local");
    const values = parse(readFileSync(path));
    values.STRIPE_SECRET_KEY = key;
    values.STRIPE_WEBHOOK_SECRET = signingSecret;
    values.STRIPE_MODE = "dev";
    values.STRIPE_PORTAL_CONFIGURATION_ID = portal.id;
    values.MISSAO_CONTENT_MANAGER_EMAILS = "helena@informach.com.br";
    for (const item of catalog) values[item.variable] = item.priceId;
    writeFileSync(
      path,
      `${Object.entries(values)
        .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
        .join("\n")}\n`,
    );
  }
  console.log(JSON.stringify(output));
} catch (error) {
  console.error(
    JSON.stringify({
      type: error.type ?? error.name,
      code: error.code,
      parameter: error.param,
      stage,
      message: String(error.message).replace(/(?:sk|rk)_(?:test|live)_[\w]+/g, "[redacted]"),
    }),
  );
  process.exitCode = 1;
}
