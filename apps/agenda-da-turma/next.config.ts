import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Headers de segurança estáticos. CSP é setada per-request em `src/proxy.ts`
 * (nonce + 'strict-dynamic' + report-uri pro Sentry), por isso fica fora
 * desta lista. HSTS só vai pra produção — em dev/local quebra navegação se o
 * cert local não for HTTPS.
 *
 * Webhooks (/api/webhooks/*) precisam de COOP/CORP relaxados defensivamente
 * porque são chamados por servidores externos (Stripe/SendGrid), não browser.
 *
 * `microphone=(self)` é necessário para cadastro de matérias/atividades por
 * voz (MediaRecorder no client). `camera=(self)` libera `<input type="file"
 * capture="environment">` no fluxo de cadastro por imagem no mobile.
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
      "camera=(self)",
      "geolocation=()",
      "microphone=(self)",
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
  images: {
    // AVIF + WebP servidos automaticamente pelo Next/image quando o browser
    // suporta. Reduz banda em ~30-50% vs PNG/JPEG nos previews de imagem.
    formats: ["image/avif", "image/webp"],
  },
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
  /**
   * Endereços antigos, que links salvos e e-mails de lembrete ainda usam.
   * Redirecionar aqui responde 307 antes de renderizar: feito na página, o
   * layout já ia para o navegador no endereço antigo e o rodapé marcava uma
   * aba no servidor e outra na hidratação. Temporário (307) de propósito: o
   * navegador guarda um 308 para sempre, e o produto ainda está em movimento.
   * A busca (`?perfil=`) segue junto.
   */
  async redirects() {
    return [
      { source: "/recados/acoes/:id", destination: "/atividades/:id", permanent: false },
      {
        source: "/atividades/:id/historico",
        destination: "/atividades/:id?historico=1#historico",
        permanent: false,
      },
      // Só `/perfis`: `/perfis/[id]/extras` continua sendo uma tela.
      { source: "/perfis", destination: "/familia", permanent: false },
      { source: "/turmas", destination: "/familia/turmas", permanent: false },
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
  // Eventos do client tunelados via /monitoring (same-origin) em vez de
  // *.ingest.sentry.io — adblockers (uBlock/AdGuard) bloqueiam o domínio
  // do Sentry e a app perde captura desses users. Next gera o handler
  // /monitoring que proxia server-side. Custo: ~banda/CPU do edge por
  // evento, irrelevante em low-traffic.
  tunnelRoute: "/monitoring",
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
