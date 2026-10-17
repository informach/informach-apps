import { readFileSync } from "node:fs";
import {
  defineRailway,
  github,
  image,
  postgres,
  preserve,
  project,
  redis,
  service,
  volume,
} from "railway/iac";

// Infraestrutura do projeto informach-apps no Railway, ambiente production.
// Este arquivo descreve o projeto inteiro: o que sair daqui é apagado no próximo
// apply. Sempre revise `railway config plan` antes de `railway config apply`.
// Fluxo e cuidados: docs/deploy-runbook.md, seção "Infraestrutura como código".
//
// Valores padrão do Railway (reinício ON_FAILURE, sleep desligado) ficam de fora:
// ele guarda o padrão como vazio, e declarar só cria diferença eterna no plano.

const PROJECT_ID = "f4da4285-5b98-48b5-b03e-5be02f4e7c56";
const PRODUCTION_ID = "174b2cb0-e1cd-410c-8764-d913e3af18d3";
const REPOSITORY = "informach/informach-apps";
const REGION = "us-west2";

// Lançamentos que dependem de passos fora deste arquivo. Enquanto `false`, o
// bloco espelha o que está no ar e o plano fica zerado; virar para `true` e
// aplicar é o passo de lançamento. Nunca apague o bloco do serviço para
// "limpar" o plano: num arquivo do projeto inteiro, isso apaga o serviço.
/** Bastidores no ar: domínio, segredos e o merge do app vêm antes (apps/admin/PRODUCAO.md). */
const ADMIN_LAUNCHED = true;
/** Cron de conciliação do Edi: só depois da distribuição assinada e da cobrança homologada (apps/edi/PRODUCAO.md). */
const EDI_RECONCILE_ACTIVE = true;

// O Railpack escolhe o Node pela variável abaixo; a versão vem do .nvmrc, a
// mesma do CI e do desenvolvimento.
const NODE_VERSION = readFileSync(new URL("../.nvmrc", import.meta.url), "utf8").trim();

// Arquivos da raiz que mudam o build de qualquer app do monorepo.
const WORKSPACE_FILES = [
  "/package.json",
  "/pnpm-lock.yaml",
  "/pnpm-workspace.yaml",
  "/tsconfig.base.json",
  "/turbo.json",
];

function packages(...names: string[]): string[] {
  return names.map((name) => `/packages/${name}/**`);
}

// Next.js com `output: "standalone"`: o build copia public/ e .next/static para
// dentro do standalone, e o start roda o server.js gerado.
function standaloneNext(app: string) {
  const root = `apps/${app}`;
  const standalone = `${root}/.next/standalone/${root}`;
  return {
    buildCommand: [
      `pnpm install --frozen-lockfile --prod=false && pnpm build:${app}`,
      `cp -R ${root}/public ${standalone}/public`,
      `cp -R ${root}/.next/static ${standalone}/.next/static`,
    ].join(" && "),
    startCommand: `HOSTNAME=0.0.0.0 node ${standalone}/server.js`,
  };
}

// Roda um script do repositório como start command de uma imagem alpine/curl,
// com a mesma citação de shell do `shlex.quote` do Python.
function shellScript(path: string): string {
  return quotedScript("sh -c", path);
}

/** Mesmo esquema para um script Node do repositório, sem build: `node -e '<script>'`. */
function nodeScript(path: string): string {
  return quotedScript("node --input-type=module -e", path);
}

function quotedScript(command: string, path: string): string {
  const script = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  return `${command} '${script.replaceAll("'", `'"'"'`)}'`;
}

// Cron que chama a mesma rota de manutenção em cada domínio de APP_DOMAINS.
function perAppCron(name: string, schedule: string, job: string) {
  return service(`cron-perapp-${name}`, {
    source: image("alpine/curl:latest"),
    start: `sh -c 'for d in $APP_DOMAINS; do curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" "https://\${d}/api/jobs/${job}" || echo "Failed for \${d}, continuing"; done'`,
    replicas: { [REGION]: 1 },
    deploy: { cronSchedule: schedule, restartPolicyType: "NEVER" },
    env: { APP_DOMAINS: preserve(), CRON_SECRET: preserve() },
  });
}

// Cron que chama uma rota de manutenção global em APP_URL.
function globalCron(name: string, schedule: string, job: string) {
  return service(`cron-global-${name}`, {
    source: image("alpine/curl:latest"),
    start: `sh -c 'curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" "https://\${APP_URL}/api/jobs/${job}"'`,
    replicas: { [REGION]: 1 },
    deploy: { cronSchedule: schedule, restartPolicyType: "NEVER" },
    env: { APP_URL: preserve(), CRON_SECRET: preserve() },
  });
}

export default defineRailway((ctx) => {
  if (ctx.projectId !== PROJECT_ID || ctx.environmentId !== PRODUCTION_ID) {
    throw new Error("Este arquivo descreve apenas informach-apps / production");
  }

  const main = github(REPOSITORY, { branch: "main", checkSuites: false, rootDirectory: "/" });

  // Dados. Os volumes já existem e continuam montados pelos próprios bancos.
  const Postgres = postgres("Postgres", { region: REGION });
  Postgres.networking = { privateNetworkEndpoint: "postgres", tcpProxies: { "5432": {} } };
  const Redis = redis("Redis", { region: REGION });
  // Espalha o deploy do helper para não perder a região que ele define.
  Redis.deploy = {
    ...Redis.deploy,
    startCommand:
      '/bin/sh -c "rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH"',
  };
  Redis.networking = { privateNetworkEndpoint: "redis", tcpProxies: { "6379": {} } };
  const volumeAlerts = { usage: { "80": {}, "95": {}, "100": {} } };
  const postgresVolume = volume("postgres-volume", {
    alerts: volumeAlerts,
    allowOnlineResize: true,
    region: REGION,
    sizeMB: 50000,
  });
  const redisVolume = volume("redis-volume", {
    alerts: volumeAlerts,
    allowOnlineResize: true,
    region: REGION,
    sizeMB: 50000,
  });

  // Schema e seeds. Roda uma vez por deploy; o /api/ready dos apps segura o
  // tráfego enquanto o banco estiver atrás do build.
  const migrator = service("migrator", {
    source: main,
    build: {
      builder: "RAILPACK",
      buildCommand: "pnpm install --frozen-lockfile --prod=false",
      watchPatterns: [
        "/packages/db/**",
        "/packages/billing/src/seeds/**",
        "/packages/billing/scripts/**",
        "/packages/ai-core/**",
        "/escolas_inep.csv.gz",
        "/package.json",
        "/pnpm-lock.yaml",
        "/pnpm-workspace.yaml",
      ],
    },
    start: "pnpm db:migrate && pnpm db:seed && pnpm db:seed:reference",
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyType: "NEVER" },
    env: { DATABASE_URL: preserve(), RAILPACK_NODE_VERSION: NODE_VERSION },
  });

  const cozya = service("@informach/cozya", {
    source: main,
    build: {
      builder: "RAILPACK",
      buildCommand: standaloneNext("cozya").buildCommand,
      watchPatterns: [
        "/apps/cozya/**",
        ...packages("ai-core", "auth", "billing", "config", "db", "emails", "ui"),
        ...WORKSPACE_FILES,
      ],
    },
    start: standaloneNext("cozya").startCommand,
    healthcheck: "/api/ready",
    healthcheckTimeout: 30,
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyMaxRetries: 3 },
    domains: ["cozya.informach.com.br"],
    networking: { privateNetworkEndpoint: "informachcozya" },
    env: {
      RAILPACK_NODE_VERSION: NODE_VERSION,
      BETTER_AUTH_SECRET: preserve(),
      BETTER_AUTH_URL: preserve(),
      CRON_SECRET: preserve(),
      CSP_ENFORCE: preserve(),
      DATABASE_URL: preserve(),
      EMAIL_SANDBOX_MODE: preserve(),
      LOG_LEVEL: preserve(),
      MASTRA_LOG_LEVEL: preserve(),
      NEXT_PUBLIC_APP_URL: preserve(),
      NEXT_PUBLIC_SENTRY_DSN: preserve(),
      NODE_ENV: preserve(),
      NPM_CONFIG_PRODUCTION: preserve(),
      OPENROUTER_API_KEY: preserve(),
      OPENROUTER_HTTP_REFERER: preserve(),
      OPENROUTER_X_TITLE: preserve(),
      REDIS_URL: preserve(),
      SENDGRID_API_KEY: preserve(),
      SENDGRID_FROM: preserve(),
      SENDGRID_WEBHOOK_PUBLIC_KEY: preserve(),
      SENTRY_AUTH_TOKEN: preserve(),
      SENTRY_DSN: preserve(),
      SENTRY_ORG: preserve(),
      SENTRY_PROJECT: preserve(),
      STRIPE_MODE: preserve(),
      STRIPE_SECRET_KEY: preserve(),
      STRIPE_WEBHOOK_SECRET: preserve(),
    },
  });

  const agenda = service("@informach/agenda-da-turma", {
    source: main,
    build: {
      builder: "RAILPACK",
      buildCommand: standaloneNext("agenda-da-turma").buildCommand,
      watchPatterns: [
        "/apps/agenda-da-turma/**",
        ...packages("ai-core", "auth", "billing", "config", "db", "emails", "ui"),
        ...WORKSPACE_FILES,
      ],
    },
    start: standaloneNext("agenda-da-turma").startCommand,
    healthcheck: "/api/ready",
    healthcheckTimeout: 30,
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyMaxRetries: 3 },
    domains: ["agenda-da-turma.informach.com.br"],
    networking: { privateNetworkEndpoint: "informachagenda-da-turma" },
    env: {
      RAILPACK_NODE_VERSION: NODE_VERSION,
      BETTER_AUTH_SECRET: preserve(),
      BETTER_AUTH_URL: preserve(),
      CRON_SECRET: preserve(),
      CSP_ENFORCE: preserve(),
      DATABASE_URL: preserve(),
      EMAIL_SANDBOX_MODE: preserve(),
      LOG_LEVEL: preserve(),
      MASTRA_LOG_LEVEL: preserve(),
      NEXT_PUBLIC_APP_URL: preserve(),
      NEXT_PUBLIC_SENTRY_DSN: preserve(),
      NODE_ENV: preserve(),
      NPM_CONFIG_PRODUCTION: preserve(),
      OPENROUTER_API_KEY: preserve(),
      OPENROUTER_HTTP_REFERER: preserve(),
      OPENROUTER_X_TITLE: preserve(),
      REDIS_URL: preserve(),
      SENDGRID_API_KEY: preserve(),
      SENDGRID_FROM: preserve(),
      SENDGRID_WEBHOOK_PUBLIC_KEY: preserve(),
      SENTRY_AUTH_TOKEN: preserve(),
      SENTRY_DSN: preserve(),
      SENTRY_ORG: preserve(),
      SENTRY_PROJECT: preserve(),
      STRIPE_MODE: preserve(),
      STRIPE_SECRET_KEY: preserve(),
      STRIPE_WEBHOOK_SECRET: preserve(),
    },
  });

  const missaoSaber = service("@informach/missao-saber", {
    source: main,
    build: {
      builder: "RAILPACK",
      buildCommand: "pnpm install --frozen-lockfile --prod=false && pnpm build:missao-saber",
      watchPatterns: [
        "/apps/missao-saber/**",
        ...packages("auth", "billing", "config", "db", "emails", "ui"),
        ...WORKSPACE_FILES,
      ],
    },
    start: "pnpm start:missao-saber",
    healthcheck: "/api/ready",
    healthcheckTimeout: 60,
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyMaxRetries: 3 },
    domains: ["missao-saber.informach.com.br"],
    networking: { privateNetworkEndpoint: "informachmissao-saber" },
    env: {
      RAILPACK_NODE_VERSION: NODE_VERSION,
      BETTER_AUTH_SECRET: preserve(),
      BETTER_AUTH_URL: preserve(),
      CRON_SECRET: preserve(),
      DATABASE_URL: preserve(),
      EMAIL_SANDBOX_MODE: preserve(),
      LOG_LEVEL: preserve(),
      MISSAO_CONTENT_MANAGER_EMAILS: preserve(),
      MISSAO_FAMILY_ANNUAL_PRICE: preserve(),
      MISSAO_FAMILY_MONTHLY_PRICE: preserve(),
      MISSAO_INDIVIDUAL_ANNUAL_PRICE: preserve(),
      MISSAO_INDIVIDUAL_MONTHLY_PRICE: preserve(),
      NEXT_PUBLIC_APP_URL: preserve(),
      NEXT_PUBLIC_SENTRY_DSN: preserve(),
      NODE_ENV: preserve(),
      NPM_CONFIG_PRODUCTION: preserve(),
      OPENROUTER_API_KEY: preserve(),
      OPENROUTER_HTTP_REFERER: preserve(),
      OPENROUTER_X_TITLE: preserve(),
      PORT: preserve(),
      REDIS_URL: preserve(),
      SENDGRID_API_KEY: preserve(),
      SENDGRID_FROM: preserve(),
      SENDGRID_WEBHOOK_PUBLIC_KEY: preserve(),
      SENTRY_AUTH_TOKEN: preserve(),
      SENTRY_DSN: preserve(),
      SENTRY_ORG: preserve(),
      SENTRY_PROJECT: preserve(),
      STRIPE_MODE: preserve(),
      STRIPE_PORTAL_CONFIGURATION_ID: preserve(),
      STRIPE_SECRET_KEY: preserve(),
      STRIPE_WEBHOOK_SECRET: preserve(),
    },
  });

  const site = service("@informach/informach-site", {
    source: main,
    build: {
      builder: "RAILPACK",
      buildCommand: "pnpm install --frozen-lockfile --prod=false && pnpm build:informach-site",
      watchPatterns: ["/apps/informach-site/**", ...packages("config", "ui"), ...WORKSPACE_FILES],
    },
    start: "pnpm start:informach-site",
    healthcheck: "/",
    healthcheckTimeout: 30,
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyMaxRetries: 3 },
    domains: ["www.informach.com.br"],
    networking: { privateNetworkEndpoint: "informachinformach-site" },
    env: { NPM_CONFIG_PRODUCTION: preserve(), RAILPACK_NODE_VERSION: NODE_VERSION },
  });

  // Bastidores. Com ADMIN_LAUNCHED, o serviço ganha build standalone, prontidão,
  // domínio e variáveis, e entram a vigia e o resumo da semana. Antes de virar:
  // o domínio precisa existir no painel (o Railway não registra domínio próprio
  // pela IaC) e os segredos BETTER_AUTH_SECRET e CRON_SECRET, próprios deste
  // serviço, precisam estar gravados (preserve() de variável ausente não cria
  // nada). Passo a passo em apps/admin/PRODUCAO.md. O SendGrid é o do Cozya, por
  // referência.
  const adminSource = github(REPOSITORY, { branch: "main", checkSuites: false });
  const adminLaunched = service("@informach/admin", {
    source: adminSource,
    build: {
      builder: "RAILPACK",
      buildCommand: standaloneNext("admin").buildCommand,
      watchPatterns: [
        "/apps/admin/**",
        ...packages(
          "auth",
          "billing",
          "config",
          "db",
          "edi-contracts",
          "edi-licensing",
          "emails",
          "ui",
        ),
        ...WORKSPACE_FILES,
      ],
    },
    start: standaloneNext("admin").startCommand,
    healthcheck: "/api/ready",
    healthcheckTimeout: 30,
    replicas: { [REGION]: 1 },
    deploy: { restartPolicyMaxRetries: 3 },
    domains: ["admin.informach.com.br"],
    networking: { privateNetworkEndpoint: "informachadmin" },
    env: {
      NODE_ENV: "production",
      RAILPACK_NODE_VERSION: NODE_VERSION,
      NEXT_PUBLIC_APP_URL: "https://admin.informach.com.br",
      DATABASE_URL: Postgres.env.DATABASE_URL,
      // A rede privada é só IPv6; `family=0` deixa o ioredis resolver os dois.
      // biome-ignore lint/suspicious/noTemplateCurlyInString: referência do Railway, não interpolação.
      REDIS_URL: "${{Redis.REDIS_URL}}?family=0",
      EMAIL_SANDBOX_MODE: "live",
      SENDGRID_FROM: "Bastidores Informach <nao-responda@informach.com.br>",
      SENDGRID_API_KEY: cozya.env.SENDGRID_API_KEY,
      STRIPE_MODE: "prod",
      LOG_LEVEL: "info",
      BETTER_AUTH_SECRET: preserve(),
      CRON_SECRET: preserve(),
    },
  });
  // Como está no ar hoje: o esqueleto antigo, sem domínio nem variáveis.
  const adminLive = service("@informach/admin", {
    source: adminSource,
    build: {
      builder: "RAILPACK",
      buildCommand: "pnpm --filter @informach/admin build",
      watchPatterns: ["/apps/admin/**"],
    },
    start: "pnpm --filter @informach/admin start",
    replicas: { [REGION]: 1 },
    networking: { privateNetworkEndpoint: "informachadmin" },
  });

  const admin = ADMIN_LAUNCHED ? adminLaunched : adminLive;

  // Vigia (a cada 5 minutos) e resumo da semana (segunda, 8h em Brasília; a
  // terça só reenvia o que falhou na segunda, o envio é único por semana).
  // Imagem fixada por digest, a mesma dos outros crons novos: uma `latest`
  // trocada no registro não muda o que roda com o CRON_SECRET do admin.
  const adminCron = (name: string, schedule: string, job: string) =>
    service(`cron-admin-${name}`, {
      source: image(
        "alpine/curl@sha256:d7720f8cffb47e7a80d01fb2c1b38562fab0e436948537e9b77dc312d29d12d6",
      ),
      start: `sh -c 'curl --fail-with-body --silent --show-error --connect-timeout 15 --max-time 120 --request POST --header "Authorization: Bearer $CRON_SECRET" "$ADMIN_URL/api/jobs/${job}"'`,
      replicas: { [REGION]: 1 },
      deploy: { cronSchedule: schedule, restartPolicyType: "NEVER" },
      env: {
        CRON_SECRET: adminLaunched.env.CRON_SECRET,
        ADMIN_URL: "https://admin.informach.com.br",
      },
    });
  const adminCrons = ADMIN_LAUNCHED
    ? [
        adminCron("watch", "*/5 * * * *", "admin-watch"),
        adminCron("weekly", "0 11 * * 1,2", "admin-weekly"),
      ]
    : [];

  const edi = service("@informach/edi", {
    source: github(REPOSITORY, { branch: "main", rootDirectory: "/", checkSuites: true }),
    build: {
      builder: "RAILPACK",
      buildCommand: "pnpm install --frozen-lockfile --prod=false && pnpm build:edi",
      watchPatterns: [
        "/apps/edi/**",
        ...packages(
          "auth",
          "billing",
          "config",
          "db",
          "edi-contracts",
          "edi-licensing",
          "edi-releases",
          "emails",
          "ui",
        ),
        // Ordem igual à do serviço no ar; reordenar conta como mudança e redeploya.
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
      restartPolicyMaxRetries: 3,
    },
    replicas: { [REGION]: 1 },
    domains: [{ domain: "edi.informach.com.br", port: 3006 }],
    networking: { privateNetworkEndpoint: "informachedi" },
    env: {
      NODE_ENV: "production",
      RAILPACK_NODE_VERSION: NODE_VERSION,
      PORT: "3006",
      NEXT_PUBLIC_APP_URL: "https://edi.informach.com.br",
      BETTER_AUTH_URL: "https://edi.informach.com.br",
      DATABASE_URL: Postgres.env.DATABASE_URL,
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

  // Manutenção compartilhada pelos apps de assinatura.
  const crons = [
    perAppCron("billing-reconcile", "0 3 * * *", "billing-reconcile"),
    perAppCron("billing-expire-bonus", "30 3 * * *", "billing-expire-bonus"),
    perAppCron("billing-grant-monthly", "45 3 * * *", "billing-grant-monthly"),
    perAppCron("billing-dunning", "0 */6 * * *", "billing-dunning"),
    perAppCron("billing-release-reservations", "*/5 * * * *", "billing-release-reservations"),
    perAppCron("email-retry", "*/5 * * * *", "email-retry"),
    perAppCron("email-recover-stale", "*/30 * * * *", "email-recover-stale"),
    globalCron("auth-cleanup", "0 4 * * *", "auth-cleanup"),
    globalCron("email-suppression-sync", "0 5 * * *", "email-suppression-sync"),
  ];

  // Lembretes da rotina da Agenda (e-mail e push para quem ligou). O script do
  // app percorre as famílias em lotes, pelo cursor, até a última.
  const agendaRoutine = service("cron-agenda-routine", {
    source: image("node:24-alpine"),
    start: nodeScript("apps/agenda-da-turma/scripts/run-routine-job.mjs"),
    replicas: { [REGION]: 1 },
    deploy: { cronSchedule: "*/5 * * * *", restartPolicyType: "NEVER" },
    env: {
      CRON_SECRET: agenda.env.CRON_SECRET,
      NEXT_PUBLIC_APP_URL: "https://agenda-da-turma.informach.com.br",
    },
  });

  const cozyaRetention = service("cron-cozya-retention", {
    source: image("alpine/curl:latest"),
    start: `sh -c 'curl --fail-with-body --silent --show-error --connect-timeout 15 --max-time 300 --request POST --header "Authorization: Bearer $CRON_SECRET" "https://\${APP_DOMAIN}/api/jobs/cozya-retention"'`,
    replicas: { [REGION]: 1 },
    deploy: { cronSchedule: "17 * * * *", restartPolicyType: "NEVER" },
    env: { APP_DOMAIN: preserve(), CRON_SECRET: preserve() },
  });

  const missaoBilling = service("cron-missao-saber-billing", {
    source: image(
      "alpine/curl@sha256:d7720f8cffb47e7a80d01fb2c1b38562fab0e436948537e9b77dc312d29d12d6",
    ),
    start: shellScript("apps/missao-saber/scripts/maintenance-cron.sh"),
    replicas: { [REGION]: 1 },
    deploy: { cronSchedule: "*/5 * * * *", restartPolicyType: "NEVER" },
    env: {
      APP_ORIGIN: preserve(),
      CRON_SECRET: preserve(),
      SENTRY_DSN: preserve(),
      SENTRY_ENVELOPE_URL: preserve(),
    },
  });

  const missaoWeeklyReport = service("cron-missao-saber-weekly-report", {
    source: main,
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "infrastructure/railway/missao-weekly-cron.Dockerfile",
      watchPatterns: [
        "/apps/missao-saber/scripts/weekly-report-cron.sh",
        "/infrastructure/railway/missao-weekly-cron*",
      ],
    },
    start: "sh /app/weekly-report-cron.sh",
    replicas: { [REGION]: 1 },
    deploy: { cronSchedule: "0 12 * * 1,2", restartPolicyType: "NEVER" },
    env: {
      APP_ORIGIN: preserve(),
      CRON_SECRET: preserve(),
      SENTRY_DSN: preserve(),
      SENTRY_ENVELOPE_URL: preserve(),
    },
  });

  // Sem imagem, o cron não roda. Ela entra com EDI_RECONCILE_ACTIVE, depois da
  // distribuição assinada e da cobrança homologada.
  const ediReconcile = service("cron-edi-reconcile", {
    ...(EDI_RECONCILE_ACTIVE
      ? {
          source: image(
            "alpine/curl@sha256:d7720f8cffb47e7a80d01fb2c1b38562fab0e436948537e9b77dc312d29d12d6",
          ),
        }
      : {}),
    deploy: {
      cronSchedule: "*/5 * * * *",
      restartPolicyType: "NEVER",
      startCommand:
        'sh -ec \'curl --fail --silent --show-error --connect-timeout 10 --max-time 60 --request POST --header "Authorization: Bearer $CRON_SECRET" "$EDI_PORTAL_URL/api/jobs/reconcile"\'',
    },
    replicas: { [REGION]: 1 },
    env: {
      CRON_SECRET: edi.env.CRON_SECRET,
      EDI_PORTAL_URL: "https://edi.informach.com.br",
    },
  });

  return project("informach-apps", {
    resources: [
      Postgres,
      Redis,
      postgresVolume,
      redisVolume,
      migrator,
      cozya,
      agenda,
      missaoSaber,
      site,
      admin,
      ...adminCrons,
      edi,
      ...crons,
      agendaRoutine,
      cozyaRetention,
      missaoBilling,
      missaoWeeklyReport,
      ediReconcile,
    ],
  });
});
