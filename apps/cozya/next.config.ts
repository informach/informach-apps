import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Headers de segurança estáticos. CSP é setada per-request em `src/proxy.ts`
 * (nonce + 'strict-dynamic'), por isso fica fora desta lista. HSTS só vai pra
 * produção — em dev/local quebra navegação se o cert local não for HTTPS.
 *
 * Webhooks (/api/webhooks/*) precisam de COOP/CORP relaxados defensivamente
 * porque são chamados por servidores externos (Stripe/SendGrid), não browser.
 */
const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "geolocation=()",
      "microphone=(self)", // necessário para receita por voz
      "payment=()",
      "usb=()",
      "accelerometer=()",
      "gyroscope=()",
      "magnetometer=()",
      "midi=()",
      "interest-cohort=()",
    ].join(", "),
  },
];

const productionOnlyHeaders = isProd
  ? [
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
    ]
  : [];

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: [
    "@informach/ai-core",
    "@informach/auth",
    "@informach/billing",
    "@informach/config",
    "@informach/db",
    "@informach/emails",
    "@informach/ui",
  ],
  typedRoutes: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...baseSecurityHeaders, ...productionOnlyHeaders],
      },
      {
        // Webhooks são consumidos por servidores externos (não browser);
        // relaxar COOP/CORP evita falsos positivos sem afrouxar a defesa do
        // app. Signature verification continua no handler.
        source: "/api/webhooks/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "unsafe-none" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      },
    ];
  },
};

const hasSentrySourceMapConfig = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT,
);

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  sourcemaps: {
    disable: !hasSentrySourceMapConfig,
    deleteSourcemapsAfterUpload: true,
  },
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
