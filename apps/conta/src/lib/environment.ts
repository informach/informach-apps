import { webSsoEnvironment, webSsoOrigin } from "@informach/auth/web-sso-contract";
import { getProductPriceVariableNames } from "@informach/config";
import { getCollectionApps } from "@informach/config/collections";
import { z } from "zod";

/** Secret or restricted key of the configured mode; production services use restricted keys. */
const stripeKeyMatchesMode = (key: string, mode: "dev" | "prod") =>
  (mode === "prod" ? /^(sk|rk)_live_/ : /^(sk|rk)_test_/).test(key);
const priceId = z.union([z.literal(""), z.string().regex(/^price_[A-Za-z0-9_]+$/)]).default("");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    NEXT_PUBLIC_APP_URL: z.enum([
      webSsoOrigin("conta", "development"),
      webSsoOrigin("conta", "production"),
    ]),
    BETTER_AUTH_SECRET: z.string().min(32),
    COMPASSO_TRIAL_HASH_SECRET: z.string().min(32),
    SENDGRID_API_KEY: z.string().default(""),
    SENDGRID_FROM: z.string().default("Minha conta <nao-responda@informach.com.br>"),
    EMAIL_SANDBOX_MODE: z.enum(["live", "sandbox", "memory"]).default("live"),
    EMAIL_SANDBOX_DIR: z.string().default("./tmp/emails"),
    COMPASSO_BILLING_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    STRIPE_MODE: z.enum(["dev", "prod"]).default("dev"),
    COMPASSO_MONTHLY_PRICE: priceId,
    COMPASSO_ANNUAL_PRICE: priceId,
    COMPASSO_CREDITS_100_PRICE: priceId,
    COMPASSO_CREDITS_300_PRICE: priceId,
    COMPASSO_CREDITS_1000_PRICE: priceId,
    STRIPE_SECRET_KEY: z.string().default(""),
    STRIPE_WEBHOOK_SECRET: z.string().default(""),
    STRIPE_PORTAL_CONFIGURATION_ID: z.string().default(""),
    CRON_SECRET: z.union([z.literal(""), z.string().min(32)]).default(""),
  })
  .superRefine((env, ctx) => {
    if (env.STRIPE_SECRET_KEY && !stripeKeyMatchesMode(env.STRIPE_SECRET_KEY, env.STRIPE_MODE))
      ctx.addIssue({
        code: "custom",
        path: ["STRIPE_SECRET_KEY"],
        message: "Stripe credentials must match the configured mode",
      });
    if (env.STRIPE_WEBHOOK_SECRET && !env.STRIPE_WEBHOOK_SECRET.startsWith("whsec_"))
      ctx.addIssue({
        code: "custom",
        path: ["STRIPE_WEBHOOK_SECRET"],
        message: "Invalid webhook configuration",
      });
    if (
      (env.STRIPE_SECRET_KEY || env.COMPASSO_BILLING_ENABLED) &&
      env.STRIPE_MODE === "prod" &&
      (env.NODE_ENV !== "production" ||
        webSsoEnvironment("conta", env.NEXT_PUBLIC_APP_URL) !== "production")
    )
      ctx.addIssue({
        code: "custom",
        path: ["STRIPE_MODE"],
        message: "Local environments cannot use live billing",
      });
    if (env.COMPASSO_BILLING_ENABLED) {
      if (
        !stripeKeyMatchesMode(env.STRIPE_SECRET_KEY, env.STRIPE_MODE) ||
        !env.STRIPE_WEBHOOK_SECRET.startsWith("whsec_") ||
        !env.STRIPE_PORTAL_CONFIGURATION_ID.startsWith("bpc_") ||
        env.CRON_SECRET.length < 32
      )
        ctx.addIssue({
          code: "custom",
          path: ["COMPASSO_BILLING_ENABLED"],
          message:
            "Billing requires matching Stripe credentials, a dedicated portal and cron authentication",
        });
    }
    if (env.EMAIL_SANDBOX_MODE === "live" && !env.SENDGRID_API_KEY)
      ctx.addIssue({
        code: "custom",
        path: ["SENDGRID_API_KEY"],
        message: "Live email requires provider configuration",
      });
    if (
      webSsoEnvironment("conta", env.NEXT_PUBLIC_APP_URL) === "production" &&
      env.EMAIL_SANDBOX_MODE !== "live"
    )
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_SANDBOX_MODE"],
        message: "Production requires live email",
      });
  });
export function readAccountEnvironment(source: Record<string, string | undefined>) {
  const env = schema.parse(source);
  const environment = webSsoEnvironment("conta", env.NEXT_PUBLIC_APP_URL);
  const legacyPrices = z
    .record(z.string(), priceId)
    .parse(
      Object.fromEntries(
        getProductPriceVariableNames(getCollectionApps("compasso").map((app) => app.slug)).map(
          (name) => [name, source[name] ?? ""],
        ),
      ),
    );
  return { ...env, legacyPrices, environment, origin: webSsoOrigin("conta", environment) };
}
