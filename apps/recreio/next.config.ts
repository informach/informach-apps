import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const isolatedSuffix = process.env.RECREIO_E2E_RUN_ID;
if (isolatedSuffix && !/^[a-f0-9]{24}$/.test(isolatedSuffix))
  throw new Error("RECREIO_E2E_RUN_ID must be a 24-character hexadecimal identifier");
const config: NextConfig = {
  output: "standalone",
  distDir:
    process.env.RECREIO_ISOLATED_TEST === "1"
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
    "@informach/recreio",
    "@informach/ui",
  ],
  // O Railway expõe ambiente e commit também no build; o cliente do Sentry os
  // recebe daqui, sem variável NEXT_PUBLIC_* criada à mão.
  env: {
    NEXT_PUBLIC_RAILWAY_ENVIRONMENT_NAME:
      process.env.NEXT_PUBLIC_RAILWAY_ENVIRONMENT_NAME ??
      process.env.RAILWAY_ENVIRONMENT_NAME ??
      "",
    NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA:
      process.env.NEXT_PUBLIC_RAILWAY_GIT_COMMIT_SHA ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? "",
    // Gravado no build: sem `RECREIO_JOGO_DE_TESTE=1`, o registro dos clientes
    // (`features/jogar/registro.ts`) nem empacota o jogo de teste.
    RECREIO_CLIENTE_DE_TESTE: process.env.RECREIO_JOGO_DE_TESTE === "1" ? "1" : "",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
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
