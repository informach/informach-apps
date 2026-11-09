import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const isolatedSuffix = process.env.BORA_E2E_RUN_ID;
if (isolatedSuffix && !/^[a-f0-9]{24}$/.test(isolatedSuffix))
  throw new Error("BORA_E2E_RUN_ID must be a 24-character hexadecimal identifier");
const config: NextConfig = {
  output: "standalone",
  distDir:
    process.env.BORA_ISOLATED_TEST === "1"
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
  ],
  experimental: { serverActions: { bodySizeLimit: "256kb" } },
  // Só em desenvolvimento: o playground passa os IPs da rede local para abrir no celular.
  allowedDevOrigins: process.env.BORA_DEV_ORIGINS?.split(",").filter(Boolean),
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
          // A câmera conta repetições no próprio aparelho e o microfone serve
          // à contagem pela voz; tela cheia e tela acesa servem ao player na
          // TV. Nada além disso. `microphone=()` proibia o microfone na origem
          // inteira: o navegador negava sem perguntar e a voz nunca ligava.
          {
            key: "Permissions-Policy",
            value:
              "camera=(self), microphone=(self), geolocation=(), fullscreen=(self), screen-wake-lock=(self)",
          },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
            : []),
        ],
      },
      {
        // O detector de pose é grande e não muda entre deploys com o mesmo hash.
        source: "/mediapipe/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
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
