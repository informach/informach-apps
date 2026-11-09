import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const isolatedSuffix = process.env.ESTRELA_E2E_RUN_ID;
if (isolatedSuffix && !/^[a-f0-9]{24}$/.test(isolatedSuffix))
  throw new Error("ESTRELA_E2E_RUN_ID must be a 24-character hexadecimal identifier");
const config: NextConfig = {
  output: "standalone",
  distDir:
    process.env.ESTRELA_ISOLATED_TEST === "1"
      ? isolatedSuffix
        ? `.next-isolated-${isolatedSuffix}`
        : ".next-e2e"
      : ".next",
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  turbopack: { root: path.resolve(__dirname, "../..") },
  transpilePackages: [
    "@informach/auth",
    "@informach/billing",
    "@informach/config",
    "@informach/db",
    "@informach/emails",
    "@informach/ui",
  ],
  // A voz gravada de uma tarefa (até ~300 KB) e a foto da meta (até 250 KB)
  // chegam por server action; o resto dos formulários é pequeno.
  experimental: { serverActions: { bodySizeLimit: "512kb" } },
  // O Railway expõe ambiente e commit também no build; o cliente do Sentry os
  // recebe daqui, sem variável NEXT_PUBLIC_* criada à mão.
  env: {
    NEXT_PUBLIC_RAILWAY_ENVIRONMENT_NAME:
      process.env.NEXT_PUBLIC_RAILWAY_ENVIRONMENT_NAME ??
      process.env.RAILWAY_ENVIRONMENT_NAME ??
      "",
    NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA:
      process.env.NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? "",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Microfone só da própria origem: os pais gravam a voz de uma tarefa.
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
            : []),
        ],
      },
    ];
  },
};
export default withSentryConfig(config, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
    deleteSourcemapsAfterUpload: true,
  },
});
