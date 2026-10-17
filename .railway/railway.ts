import { defineRailway, github, preserve, project, service } from "railway/iac";

// Adopt only Edi during the transition from legacy per-app Config as Code.
// Other services in this monorepo retain their existing configuration and ownership.
export const partial = "edi";

export default defineRailway((ctx) => {
  if (
    ctx.projectId !== "f4da4285-5b98-48b5-b03e-5be02f4e7c56" ||
    ctx.environmentId !== "174b2cb0-e1cd-410c-8764-d913e3af18d3"
  ) {
    throw new Error("Edi infrastructure must target informach-apps / production");
  }

  const edi = service("@informach/edi", {
    source: github("informach/informach-apps", {
      branch: "main",
      rootDirectory: "/",
      checkSuites: true,
    }),
    build: {
      builder: "RAILPACK",
      buildCommand: "pnpm install --frozen-lockfile --prod=false && pnpm build:edi",
      watchPatterns: [
        "/apps/edi/**",
        "/packages/auth/**",
        "/packages/billing/**",
        "/packages/config/**",
        "/packages/db/**",
        "/packages/edi-contracts/**",
        "/packages/edi-licensing/**",
        "/packages/edi-releases/**",
        "/packages/emails/**",
        "/packages/ui/**",
        "/package.json",
        "/pnpm-lock.yaml",
        "/pnpm-workspace.yaml",
        "/turbo.json",
        "/tsconfig.base.json",
      ],
    },
    deploy: {
      preDeployCommand: ["node apps/edi/.next/standalone/apps/edi/setup-oauth.cjs"],
      startCommand: "HOSTNAME=0.0.0.0 node apps/edi/.next/standalone/apps/edi/server.js",
      healthcheckPath: "/api/ready",
      healthcheckTimeout: 60,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 3,
      sleepApplication: false,
    },
    domains: [{ domain: "edi.informach.com.br", port: 3006 }],
    env: {
      NODE_ENV: "production",
      PORT: "3006",
      NEXT_PUBLIC_APP_URL: "https://edi.informach.com.br",
      BETTER_AUTH_URL: "https://edi.informach.com.br",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Railway provider reference, not JavaScript interpolation.
      DATABASE_URL: "${{Postgres.DATABASE_URL}}",
      EDI_DESKTOP_CLIENT_ID: "edi-desktop",
      EDI_DISTRIBUTION_REPOSITORY: "informach/edi-releases",
      EDI_MINIMUM_CLIENT_VERSION: "0.1.0",
      EMAIL_SANDBOX_MODE: "live",
      SENDGRID_FROM: "Suíte Edi <nao-responda@informach.com.br>",
      STRIPE_MODE: "prod",
      STRIPE_SECRET_KEY: preserve(),
      STRIPE_WEBHOOK_SECRET: preserve(),
      STRIPE_PORTAL_CONFIGURATION_ID: preserve(),
      EDI_MONTHLY_PRICE_PROD: preserve(),
      EDI_ANNUAL_PRICE_PROD: preserve(),
      EDI_BILLING_ENABLED: preserve(),
      BETTER_AUTH_SECRET: preserve(),
      CRON_SECRET: preserve(),
      EDI_LICENSE_KEY_ID: preserve(),
      EDI_LICENSE_PRIVATE_KEY: preserve(),
      EDI_UPDATE_PUBLIC_KEYS: preserve(),
      SENDGRID_API_KEY: preserve(),
      SENTRY_DSN: preserve(),
    },
  });

  const reconcile = service("cron-edi-reconcile", {
    // The image source is enabled after the portal is ready and billing is homologated.
    deploy: {
      cronSchedule: "*/5 * * * *",
      restartPolicyType: "NEVER",
      startCommand:
        'sh -ec \'curl --fail --silent --show-error --connect-timeout 10 --max-time 60 --request POST --header "Authorization: Bearer $CRON_SECRET" "$EDI_PORTAL_URL/api/jobs/reconcile"\'',
    },
    env: {
      CRON_SECRET: edi.env.CRON_SECRET,
      EDI_PORTAL_URL: "https://edi.informach.com.br",
    },
  });

  return project("informach-apps", { resources: [edi, reconcile] });
});
