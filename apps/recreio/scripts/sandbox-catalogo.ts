import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createStripePaymentFactReader } from "@informach/billing/payment-facts";
import { PRODUCTS } from "@informach/config";
import Stripe from "stripe";
import { isStripeTestSecret } from "../src/lib/environment";

/** Explicit operations workflow only. Never reads or accepts a live key. */
async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  const expectedAccount = process.env.STRIPE_EXPECTED_ACCOUNT;
  const appUrl = new URL(process.env.RECREIO_SANDBOX_APP_URL ?? "");
  const apply = process.env.RECREIO_SANDBOX_APPLY === "true";
  const nativeRenewals = process.env.RECREIO_SANDBOX_NATIVE_RENEWALS === "true";
  const portalPolicy = nativeRenewals ? "native-v2" : "native-v1";
  const output = process.env.RECREIO_SANDBOX_RECEIPT_PATH;
  if (
    !isStripeTestSecret(key) ||
    !expectedAccount ||
    !expectedAccount.startsWith("acct_") ||
    !output ||
    appUrl.username ||
    appUrl.password ||
    (appUrl.protocol !== "https:" &&
      !(appUrl.protocol === "http:" && appUrl.hostname === "localhost"))
  )
    throw new Error(
      "Sandbox operations require a test key, expected account, origin and receipt path",
    );
  const origin = appUrl.origin;
  const stripe = new Stripe(key, {
    apiVersion: "2026-04-22.dahlia",
    timeout: 10_000,
    maxNetworkRetries: 0,
  });
  const account = await stripe.accounts.retrieve(expectedAccount);
  if (account.id !== expectedAccount)
    throw new Error("Stripe account differs from the admitted sandbox account");
  const products: Stripe.Product[] = [];
  for await (const product of stripe.products.list({ limit: 100 })) {
    if (products.length >= 600)
      throw new Error("Sandbox product inventory exceeds inspection limit");
    products.push(product);
  }
  const offers = PRODUCTS.filter((p) => p.app === "recreio" && p.kind === "subscription");
  if (offers.length !== 4)
    throw new Error("Recreio approved catalog must contain exactly four subscription offers");
  const variables: Record<string, string> = {};
  const proposed: string[] = [];
  for (const tier of ["individual", "family"] as const) {
    const candidates = products.filter(
      (p) =>
        p.metadata.app === "recreio" &&
        p.metadata.tier === tier &&
        p.metadata.catalog_version === "v1",
    );
    if (candidates.length > 1) throw new Error("Ambiguous native sandbox product");
    let product = candidates[0];
    if (!product && apply)
      product = await stripe.products.create(
        {
          name: tier === "individual" ? "Recreio Individual" : "Recreio Família",
          metadata: { app: "recreio", tier, catalog_version: "v1" },
        },
        { idempotencyKey: `recreio:sandbox:catalog:v1:product:${tier}` },
      );
    if (product && (!product.active || product.livemode))
      throw new Error("Native sandbox product is inactive or live");
    const prices: Stripe.Price[] = [];
    if (product)
      for await (const price of stripe.prices.list({ product: product.id, limit: 100 })) {
        if (prices.length >= 600)
          throw new Error("Sandbox price inventory exceeds inspection limit");
        prices.push(price);
      }
    for (const offer of offers.filter((o) => o.tier === tier)) {
      if (!offer.stripePriceEnvironmentVariable || !offer.listPrice || !offer.interval)
        throw new Error("Approved Recreio offer is incomplete");
      const candidates = prices.filter(
        (p) =>
          p.metadata.app === "recreio" &&
          p.metadata.offer_id === offer.id &&
          p.metadata.catalog_version === "v1",
      );
      if (candidates.length > 1) throw new Error("Ambiguous native sandbox price");
      let price = candidates[0];
      if (!price && apply && product)
        price = await stripe.prices.create(
          {
            product: product.id,
            currency: offer.listPrice.currency.toLowerCase(),
            unit_amount: offer.listPrice.amountCents,
            recurring: { interval: offer.interval, interval_count: 1 },
            metadata: { app: "recreio", offer_id: offer.id, catalog_version: "v1" },
          },
          { idempotencyKey: `recreio:sandbox:catalog:v1:price:${offer.id}` },
        );
      if (!price) {
        proposed.push(offer.id);
        continue;
      }
      if (
        price.livemode ||
        !price.active ||
        price.unit_amount !== offer.listPrice.amountCents ||
        price.currency !== offer.listPrice.currency.toLowerCase() ||
        price.recurring?.interval !== offer.interval ||
        price.recurring.interval_count !== 1 ||
        price.billing_scheme !== "per_unit"
      )
        throw new Error("Existing sandbox price differs from the approved immutable offer");
      variables[offer.stripePriceEnvironmentVariable] = price.id;
    }
  }
  const portals: Stripe.BillingPortal.Configuration[] = [];
  for await (const portal of stripe.billingPortal.configurations.list({ limit: 100 })) {
    if (portals.length >= 600) throw new Error("Sandbox portal inventory exceeds inspection limit");
    portals.push(portal);
  }
  const candidates = portals.filter(
    (p) =>
      p.metadata?.app === "recreio" &&
      p.metadata.policy_version === portalPolicy &&
      p.metadata.origin === origin,
  );
  if (candidates.length > 1) throw new Error("Ambiguous native sandbox portal");
  let portal = candidates[0];
  if (!portal && apply)
    portal = await stripe.billingPortal.configurations.create(
      {
        metadata: { app: "recreio", policy_version: portalPolicy, origin },
        default_return_url: `${origin}/conta/assinatura`,
        business_profile: {
          headline: "Sua assinatura Recreio",
          terms_of_service_url: `${origin}/termos`,
          privacy_policy_url: `${origin}/privacidade`,
        },
        login_page: { enabled: false },
        features: {
          customer_update: {
            enabled: true,
            allowed_updates: ["name", "address", "email", "tax_id"],
          },
          invoice_history: { enabled: true },
          payment_method_update: { enabled: true },
          subscription_update: { enabled: false },
          subscription_cancel: {
            enabled: !nativeRenewals,
            mode: "at_period_end",
            proration_behavior: "none",
          },
        },
      },
      {
        idempotencyKey: `recreio:sandbox:portal:${portalPolicy}:${createHash("sha256").update(origin).digest("hex")}`,
      },
    );
  if (!portal) proposed.push("portal_configuration");
  if (portal) variables.STRIPE_PORTAL_CONFIGURATION_ID = portal.id;
  if (!proposed.length && portal) {
    await createStripePaymentFactReader({
      secretKey: key,
      client: stripe,
      expectedMode: "dev",
    }).verifyCatalog(
      offers.map((p) => ({
        ...p,
        stripePriceId: {
          ...p.stripePriceId,
          dev: variables[p.stripePriceEnvironmentVariable ?? ""] ?? "",
        },
      })),
      "dev",
      portal.id,
      {
        planUpdates: "application",
        ...(nativeRenewals ? { renewalCancellation: "application" } : {}),
        app: "recreio",
        returnUrl: `${origin}/conta/assinatura`,
        termsUrl: `${origin}/termos`,
        privacyUrl: `${origin}/privacidade`,
      },
    );
  }
  const receipt = {
    source: process.env.GITHUB_SHA ?? null,
    verifiedAt: new Date().toISOString(),
    accountId: account.id,
    mode: "dev",
    apply,
    portalPolicy,
    origin,
    verified: proposed.length === 0,
    proposed,
    variables,
    offers: offers.map((p) => ({
      id: p.id,
      amountCents: p.listPrice?.amountCents,
      currency: p.listPrice?.currency,
      interval: p.interval,
    })),
  };
  await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt));
}

main().catch((error: unknown) => {
  const detail =
    error instanceof Stripe.errors.StripeError
      ? { type: error.type, code: error.code ?? "unknown" }
      : {
          type: "sandbox_configuration",
          message: error instanceof Error ? error.message : "Unknown operations failure",
        };
  console.error(JSON.stringify({ status: "failed", ...detail }));
  process.exitCode = 1;
});
