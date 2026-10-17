import { createPrivateKey } from "node:crypto";
import { z } from "zod";

function isLicensePrivateKey(pem: string) {
  try {
    return createPrivateKey(pem.replaceAll("\\n", "\n")).asymmetricKeyType === "ed25519";
  } catch {
    return false;
  }
}
export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3006"),
    BETTER_AUTH_SECRET: z.string().min(32),
    SENDGRID_API_KEY: z.string().default(""),
    SENDGRID_FROM: z.string().default("Suíte Edi <nao-responda@informach.com.br>"),
    EMAIL_SANDBOX_MODE: z.enum(["live", "sandbox", "memory"]).default("live"),
    EMAIL_SANDBOX_DIR: z.string().default("./tmp/emails"),
    STRIPE_SECRET_KEY: z.string().default(""),
    STRIPE_WEBHOOK_SECRET: z.string().default(""),
    STRIPE_PORTAL_CONFIGURATION_ID: z.string().default(""),
    STRIPE_MODE: z.enum(["dev", "prod"]).default("dev"),
    EDI_BILLING_ENABLED: z.enum(["true", "false"]).default("false"),
    EDI_MONTHLY_PRICE_DEV: z.string().default(""),
    EDI_MONTHLY_PRICE_PROD: z.string().default(""),
    EDI_ANNUAL_PRICE_DEV: z.string().default(""),
    EDI_ANNUAL_PRICE_PROD: z.string().default(""),
    EDI_LICENSE_PRIVATE_KEY: z.string().max(8192).default(""),
    EDI_LICENSE_KEY_ID: z.string().max(80).default(""),
    EDI_DESKTOP_CLIENT_ID: z.string().min(1).max(128).default("edi-desktop-development"),
    EDI_DISTRIBUTION_REPOSITORY: z.string().default("informach/edi-releases"),
    EDI_UPDATE_PUBLIC_KEYS: z.string().default("{}"),
    CRON_SECRET: z.string().min(32),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  })
  .superRefine((env, ctx) => {
    const origin = URL.canParse(env.NEXT_PUBLIC_APP_URL) ? new URL(env.NEXT_PUBLIC_APP_URL) : null;
    if (origin && origin.origin !== env.NEXT_PUBLIC_APP_URL)
      ctx.addIssue({
        code: "custom",
        message: "Edi URL must be a canonical origin",
        path: ["NEXT_PUBLIC_APP_URL"],
      });
    if (env.NODE_ENV === "production" && origin?.protocol !== "https:")
      ctx.addIssue({
        code: "custom",
        message: "Production Edi URL requires HTTPS",
        path: ["NEXT_PUBLIC_APP_URL"],
      });
    if (env.NODE_ENV === "production" && env.EMAIL_SANDBOX_MODE !== "live")
      ctx.addIssue({
        code: "custom",
        message: "Production email must be live",
        path: ["EMAIL_SANDBOX_MODE"],
      });
    if (env.EMAIL_SANDBOX_MODE === "live" && !env.SENDGRID_API_KEY)
      ctx.addIssue({
        code: "custom",
        message: "Live email requires a provider key",
        path: ["SENDGRID_API_KEY"],
      });
    if (
      env.EDI_BILLING_ENABLED === "true" &&
      (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET || !env.STRIPE_PORTAL_CONFIGURATION_ID)
    )
      ctx.addIssue({ code: "custom", message: "Billing requires verified provider configuration" });
    if (env.EDI_BILLING_ENABLED === "true") {
      const mode = env.STRIPE_MODE === "prod" ? "live" : "test";
      if (
        !env.STRIPE_SECRET_KEY.startsWith(`sk_${mode}_`) &&
        !env.STRIPE_SECRET_KEY.startsWith(`rk_${mode}_`)
      )
        ctx.addIssue({
          code: "custom",
          message: "Stripe key does not match billing mode",
          path: ["STRIPE_SECRET_KEY"],
        });
      const prices =
        env.STRIPE_MODE === "prod"
          ? [env.EDI_MONTHLY_PRICE_PROD, env.EDI_ANNUAL_PRICE_PROD]
          : [env.EDI_MONTHLY_PRICE_DEV, env.EDI_ANNUAL_PRICE_DEV];
      if (prices.some((price) => !/^price_[A-Za-z0-9]+$/.test(price)) || prices[0] === prices[1])
        ctx.addIssue({
          code: "custom",
          message: "Billing requires two distinct configured suite prices",
        });
    }
    if (env.NODE_ENV === "production") {
      if (env.EDI_BILLING_ENABLED === "true" && env.STRIPE_MODE !== "prod")
        ctx.addIssue({
          code: "custom",
          message: "Production cannot enable test-mode billing",
          path: ["STRIPE_MODE"],
        });
      if (!/^[A-Za-z0-9._-]{1,80}$/.test(env.EDI_LICENSE_KEY_ID))
        ctx.addIssue({
          code: "custom",
          message: "Production requires a license key ID",
          path: ["EDI_LICENSE_KEY_ID"],
        });
      if (env.EDI_DESKTOP_CLIENT_ID === "edi-desktop-development")
        ctx.addIssue({
          code: "custom",
          message: "Production requires its desktop OAuth client",
          path: ["EDI_DESKTOP_CLIENT_ID"],
        });
      if (!isLicensePrivateKey(env.EDI_LICENSE_PRIVATE_KEY))
        ctx.addIssue({
          code: "custom",
          message: "Production requires an Ed25519 license private key",
          path: ["EDI_LICENSE_PRIVATE_KEY"],
        });
    }
  });
export type EdiEnv = z.infer<typeof envSchema>;
let cached: EdiEnv | undefined;
export function getEnv(): EdiEnv {
  cached ??= envSchema.parse(process.env);
  return cached;
}
