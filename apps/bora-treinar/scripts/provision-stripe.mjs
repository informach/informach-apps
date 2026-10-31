// Provisiona o Bora Treinar no Stripe: produtos com descrição e imagem, os
// quatro preços, a configuração do Portal e (em produção) o webhook.
// Idempotente: rodar de novo confere e atualiza, sem duplicar.
//   node apps/bora-treinar/scripts/provision-stripe.mjs dev|prod
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const domain = mode === "prod" ? "https://bora-treinar.informach.com.br" : "http://localhost:3007";
const app = "bora-treinar";
const plans = [
  [
    "individual",
    "Individual",
    2490,
    24900,
    "Treinos de calistenia em casa, só com o peso do corpo. Inclui um perfil, com instrutor 3D que mostra cada movimento, contagem de repetições pela câmera do próprio aparelho, níveis que avançam com você e desafios da semana.",
  ],
  [
    "family",
    "Família",
    3490,
    34900,
    "Para treinar junto com quem mora com você. Inclui até quatro perfis, cada um com seu nível e seu histórico, instrutor 3D, contagem de repetições pela câmera, desafios da semana e o celular como câmera da TV.",
  ],
];
let stage = "starting";
try {
  stage = "uploading icon file";
  const iconData = readFileSync(resolve(root, "apps/bora-treinar/public/app-icon.png"));
  const iconHash = createHash("sha256").update(iconData).digest("hex").slice(0, 16);
  const iconForm = new FormData();
  iconForm.set("purpose", "business_icon");
  iconForm.set("file", new Blob([iconData], { type: "image/png" }), "bora-treinar.png");
  iconForm.set("file_link_data[create]", "true");
  iconForm.set("file_link_data[metadata][app]", app);
  const iconResponse = await fetch("https://files.stripe.com/v1/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Stripe-Version": "2026-04-22.dahlia",
      "Idempotency-Key": `bora-icon-${mode}-${iconHash}`,
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
  for (const [tier, label, month, year, description] of plans) {
    stage = `provisioning ${tier} product`;
    const productId = `bora_treinar_${tier}`;
    const name = `Bora Treinar ${label}`;
    try {
      await stripe.products.retrieve(productId);
    } catch (error) {
      if (error.code !== "resource_missing") throw error;
      await stripe.products.create({
        id: productId,
        name,
        metadata: { app, kind: "subscription", tier },
      });
    }
    const product = await stripe.products.update(productId, {
      name,
      description,
      images: [iconUrl],
    });
    for (const [interval, suffix, amount] of [
      ["month", "monthly", month],
      ["year", "annual", year],
    ]) {
      // A chave de busca é o id do catálogo (packages/config/src/products.ts).
      const lookup = `bora_${tier}_${suffix}`;
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
      catalog.push({
        variable: `BORA_${tier.toUpperCase()}_${suffix.toUpperCase()}_PRICE`,
        catalogId: lookup,
        priceId: price.id,
        productId: product.id,
        amount,
        interval,
      });
    }
  }
  stage = "configuring billing portal";
  const configurations = await stripe.billingPortal.configurations.list({ limit: 100 });
  let portal = configurations.data.find((item) => item.metadata?.app === app);
  const config = {
    business_profile: {
      headline: "Gerencie sua assinatura do Bora Treinar",
      privacy_policy_url: `${domain}/privacidade`,
      terms_of_service_url: `${domain}/termos`,
    },
    default_return_url: `${domain}/conta`,
    metadata: { app },
    features: {
      customer_update: { enabled: true, allowed_updates: ["email", "name", "address"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      // Troca de plano fica no app, onde o downgrade escolhe o perfil que
      // continua ativo junto com o direito local.
      subscription_update: { enabled: false },
    },
  };
  portal = portal
    ? await stripe.billingPortal.configurations.update(portal.id, config)
    : await stripe.billingPortal.configurations.create(config, {
        idempotencyKey: `bora-portal-${mode}-v1`,
      });
  const endpointUrl = `${domain}/api/webhooks/stripe`;
  let endpoint;
  if (mode === "prod") {
    stage = "configuring webhook";
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    endpoint = endpoints.data.find((item) => item.url === endpointUrl);
    endpoint ??= await stripe.webhookEndpoints.create(
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
      { idempotencyKey: `bora-webhook-${mode}-v1` },
    );
  }
  const output = {
    mode,
    image: iconUrl,
    catalog,
    portalId: portal.id,
    webhookId: endpoint?.id ?? null,
    url: mode === "prod" ? endpointUrl : "Stripe CLI -> localhost:3007/api/webhooks/stripe",
  };
  const directory = resolve(root, "apps/bora-treinar/tmp/production");
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, `stripe-${mode}.json`), JSON.stringify(output, null, 2));
  if (mode === "prod") {
    // O segredo do webhook vai direto para o serviço, nunca para disco ou log.
    // Só existe na criação: numa segunda execução o endpoint já existe e o
    // segredo gravado antes continua valendo.
    stage = "storing Railway variables";
    const { spawnSync } = await import("node:child_process");
    const values = Object.fromEntries(catalog.map((p) => [p.variable, p.priceId]));
    values.STRIPE_PORTAL_CONFIGURATION_ID = portal.id;
    if (endpoint?.secret) values.STRIPE_WEBHOOK_SECRET = endpoint.secret;
    const result = spawnSync(
      "python",
      [
        "-c",
        "import sys,json;sys.path.insert(0,'apps/bora-treinar/scripts');import production as p;p.set_variables(p.APP,json.load(sys.stdin));print('Stripe configuration saved to Railway')",
      ],
      { cwd: root, input: JSON.stringify(values), encoding: "utf8", windowsHide: true },
    );
    if (result.status !== 0)
      throw new Error(
        "Unable to store Stripe configuration; inspect service state before rerunning",
      );
  } else {
    stage = "writing local environment";
    const { execFileSync } = await import("node:child_process");
    const signingSecret = execFileSync("stripe", ["listen", "--print-secret"], {
      env: { ...process.env, STRIPE_API_KEY: key },
      encoding: "utf8",
      windowsHide: true,
    }).trim();
    if (!signingSecret.startsWith("whsec_"))
      throw new Error("Unable to obtain local Stripe CLI signing secret");
    const path = resolve(root, "apps/bora-treinar/.env.local");
    const base = existsSync(path) ? path : resolve(root, "apps/bora-treinar/.env.example");
    const values = parse(readFileSync(base));
    values.STRIPE_SECRET_KEY = key;
    values.STRIPE_WEBHOOK_SECRET = signingSecret;
    values.STRIPE_MODE = "dev";
    values.STRIPE_PORTAL_CONFIGURATION_ID = portal.id;
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
