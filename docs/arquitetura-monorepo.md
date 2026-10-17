# Arquitetura do monorepo

Referência transversal para os produtos da casa. Foca em **como o repositório se organiza como um todo** — tooling, layout, regras, CI/CD e distribuição. Para apps web, ver [`arquitetura-apps.md`](./arquitetura-apps.md); para ferramentas desktop, ver [`arquitetura-desktop.md`](./arquitetura-desktop.md). Para packages, ver [`arquitetura-packages.md`](./arquitetura-packages.md).

O [AGENTS.md da raiz](../AGENTS.md) é a entrada comum para as orientações de trabalho. O [estado do repositório](estado-do-repositorio.md) aponta para a frente atual e seus registros de implementação. Atualize este documento quando uma mudança alterar as regras transversais; versões efetivas e comandos vêm dos manifests, lockfile e workflows.

---

## Por que monorepo

Vários produtos web independentes que compartilham fundações (auth, billing, banco) custam menos num repo único. Mudança em `packages/billing` que afeta três apps sai num PR, com tipos atualizados em todos os consumidores e uma rodada de CI. O contrário — repos separados com pacotes publicados — fragmenta o histórico, atrasa refatoração e cria deriva de versões.

Custos aceitos: tooling mais sofisticado (workspace manager + task runner), e blast radius maior quando se quebra uma config compartilhada. Os dois se mitigam com Turborepo e CI verde como gate de merge.

---

## Stack

Base de referência das aplicações web existentes. Os manifests e o lockfile definem as versões efetivamente adotadas; a matriz candidata de atualização e o padrão das ferramentas desktop estão em [`arquitetura-desktop.md`](./arquitetura-desktop.md). Uma versão candidata exige homologação antes de substituir a base do repositório.

| Área | Escolha | Por quê |
|---|---|---|
| Workspace manager | **pnpm 9+** | Hardlinks, lockfile determinístico, suporte nativo a workspaces, compatível com Turborepo. |
| Task runner | **Turborepo 2** | Cache local + remoto, grafo de dependências, paralelismo. Chave do config é `tasks` (não `pipeline`). |
| Runtime | **Node.js 24.15+** | `engines`, `.nvmrc` e CI alinhados em 24.15.0. |
| Linguagem | **TypeScript 5+** | Estendido por `tsconfig.base.json` na raiz. |
| Lint + format | **Biome 2.5.15** | Único binário substitui ESLint + Prettier. Schema atual: `https://biomejs.dev/schemas/2.5.15/schema.json`. |
| Estilo | **Tailwind CSS v4** | CSS-first via `@import "tailwindcss"`, tokens em `@theme`, escaneamento extra com `@source`. Sem `tailwind.config.js`. |
| App framework | **Next.js 16.4.2 App Router** | RSC, Server Actions, `output: "standalone"`, `outputFileTracingRoot` essencial para monorepo. |
| ORM | **Drizzle ORM** | Sem codegen no build, SQL-native, `pgSchema` para schemas SQL nativos por domínio. |
| DB | **PostgreSQL 16+** | Provider único compartilhado, schemas SQL para isolamento lógico. |
| CI | **GitHub Actions** | Mesma máquina/cache do dev típico, sem custo extra de plataforma. |
| CD | **Railway** | Container-based, suporta long-running (workers, websockets), Postgres+Redis como plugins, sem cost spiral de Vercel. |

Proibidos por escolha: ESLint, Prettier, Tailwind v3, Vercel como default, Prisma (preferência por Drizzle), microsserviços, microfrontends.

---

## Layout no nível da raiz

```
<repo>/
├── apps/                       # apps web deployáveis e ferramentas desktop distribuíveis
│   └── <app>/
├── packages/                   # bibliotecas internas; nunca deployadas
│   └── <pkg>/
├── .github/workflows/ci.yml
├── docs/adr/                   # Architecture Decision Records
├── biome.json
├── docker-compose.yml          # Postgres + Redis local
├── package.json                # workspaces + scripts root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── turbo.json
├── .env.example
└── .gitignore
```

`apps/` e `packages/` são as únicas duas pastas com workspaces. O resto é configuração e documentação.

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

---

## Regras de dependência

1. **Apps importam packages.** Sempre via `"workspace:*"` no `package.json`.
2. **Packages podem importar packages.** Sem ciclos. Turborepo detecta e quebra a build.
3. **Apps NÃO importam outros apps.** Se duas telas precisam compartilhar lógica, ela vira um package.
4. **Packages NÃO importam de apps.** Inversão de dependência — package é mais estável que app.
5. **Sem path aliases globais entre workspaces.** O resolver do pnpm faz o trabalho. Aliases (`@/*`) ficam por workspace, no `tsconfig.json` local.

Quem fiscaliza: a declaração no `package.json` (não compila se não estiver lá) e o grafo do Turborepo (não constrói se houver ciclo).

---

## Convenção de nomes

- Org scope: `@<org>/`. Exemplo: `@acme/`, `@informach/`.
- Pacote: kebab-case. Uma palavra para domínio (`db`, `ui`, `auth`), composto para integração específica (`payments-stripe`, `emails-resend`).
- App: nome do produto em kebab-case. Mesmo namespace org. Exemplo: `@acme/admin`, `@acme/agenda-da-turma`.

Diretório segue o mesmo nome do pacote sem o scope (`apps/admin`, `packages/db`).

---

## Scripts no `package.json` da raiz

Padrão consolidado:

```jsonc
{
  "packageManager": "pnpm@9.x.x",
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "typecheck": "turbo typecheck",
    "check": "biome check .",
    "lint": "biome lint .",
    "format": "biome format --write .",

    "dev:<app>":   "pnpm --filter @<org>/<app> dev",
    "build:<app>": "turbo build --filter=@<org>/<app>",
    "start:<app>": "pnpm --filter @<org>/<app> start",

    "db:generate": "pnpm --filter @<org>/db db:generate",
    "db:migrate":  "pnpm --filter @<org>/db db:migrate && pnpm --filter @<org>/db db:backfill-tasks && pnpm --filter @<org>/ai-core mastra:migrate",
    "db:studio":   "pnpm --filter @<org>/db db:studio",
    "db:push":     "pnpm --filter @<org>/db db:push"
  }
}
```

Atalhos por app crescem por convenção, não por script gerador. Três apps = nove atalhos (`dev:`, `build:`, `start:` × três). Aceito.

---

## `turbo.json`

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "test": {
      "dependsOn": ["build"]
    }
  }
}
```

`^build` significa "constrói as dependências do workspace antes". Crucial para que um app receba os tipos atualizados do package que ele consome.

---

## Biome (`biome.json`)

Substitui ESLint + Prettier. Configurado uma vez na raiz, herdado.

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.15/schema.json",
  "files": {
    "includes": ["**", "!**/node_modules", "!**/.next", "!**/dist", "!**/.turbo"]
  },
  "linter": {
    "enabled": true,
    "rules": { "preset": "recommended" }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  },
  "assist": {
    "actions": { "source": { "organizeImports": "on" } }
  }
}
```

Overrides ficam em `overrides[]` (ex: `noConsole: "off"` em `scripts/**`).

---

## TypeScript compartilhado

`tsconfig.base.json` na raiz com `strict: true`, `moduleResolution: "Bundler"`, `target: "ES2022"`, `jsx: "preserve"`. Cada workspace tem seu `tsconfig.json` que estende o base e configura `paths` locais (ex: `"@/*": ["./src/*"]`). Sem mapeamento global de packages — o pnpm já resolve.

---

## Variáveis de ambiente

- `.env.example` na raiz: lista TODAS as variáveis usadas por qualquer workspace, comentadas por escopo.
- `.env.example` por app: subset que o app lê. Cada app valida o seu próprio com `t3-env` em `lib/env.ts` (build falha se faltar).
- App nunca lê variável que pertence a outro app. Se duas precisam da mesma, é variável da plataforma (entra na raiz e cada app declara separadamente o que consome).
- Em produção, cada app gerencia seus próprios secrets no provider (Railway). `DATABASE_URL` é referenciado a partir do service Postgres via expressão.

---

## Banco de dados central com schemas SQL por domínio

**Recomendado**: um Postgres compartilhado, schemas SQL nativos por domínio (`core`, `billing`, `audit`, `ai`, `agenda`, `cozya`...). O package `db` declara via `pgSchema("nome").table(...)` e mantém migrations sob versão.

Por quê:
- Auth, billing, emails e auditoria (schemas `core`, `billing` e `audit`) servem os apps reais. Compartilhar tabelas é o caso de uso; o app `admin` ainda é só scaffold e não deve declarar deps internas enquanto não tiver wiring.
- Schemas SQL dão isolamento lógico e permissões por role. Se um app só precisa ler `core` e escrever em `<dominio_app>`, dá pra restringir.
- Migrations centralizadas evitam corrida de migrations entre apps que sobem em paralelo.
- Backup e operação ficam em uma fonte só.

Alternativa considerada — **DB por app**: descartada. Multiplica overhead operacional, fragmenta auth/billing comuns, força replicação cross-DB ou serviço intermediário só para join. Só justifica em apps com regulação de isolamento físico real (saúde, financeiro), o que aqui não é o caso.

Detalhes de como o `db` se organiza: ver [`arquitetura-packages.md`](./arquitetura-packages.md).

---

## Migrations

Regras invioláveis:

1. Migrations rodam **só** a partir do comando raiz `pnpm db:migrate`: primeiro `@informach/db` aplica Drizzle, depois `@informach/ai-core` inicializa o storage Mastra (`ai_mastra`).
2. Apps **não** rodam migration no `start`. Sobem assumindo schema pronto.
3. Em dev, o desenvolvedor roda manualmente após `pnpm db:generate`.
4. Em produção, migrations rodam por **operação consciente**: comando manual contra o `DATABASE_URL` de produção, ou job dedicado no provider, ou step específico em GitHub Actions disparado manualmente. Nunca acoplado ao deploy de um app.

Motivo: deploy paralelo de N apps + migration acoplada = corrida e schemas inconsistentes. Desacoplar elimina a categoria de bug.

---

## CI

`.github/workflows/ci.yml` roda em PR e push pra `main`:

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
jobs:
  ci:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: ci
          POSTGRES_PASSWORD: ci
          POSTGRES_DB: ci
        ports: ["5432:5432"]
      redis:
        image: redis:7
        ports: ["6379:6379"]
    env:
      DATABASE_URL: postgres://ci:ci@localhost:5432/ci
      BETTER_AUTH_SECRET: ci-build-placeholder-not-a-real-secret-xxxx
      BETTER_AUTH_URL: http://localhost:3000
      NEXT_PUBLIC_APP_URL: http://localhost:3000
      SENDGRID_API_KEY: ci-build-placeholder
      SENDGRID_FROM: ci@example.com
      CRON_SECRET: ci-build-placeholder-not-a-real-secret-xxxx
      STRIPE_SECRET_KEY: sk_test_ci_build_placeholder
      STRIPE_WEBHOOK_SECRET: whsec_ci_build_placeholder
      OPENROUTER_API_KEY: sk-or-ci-build-placeholder
      REDIS_URL: redis://localhost:6379
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24.15.0
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm check
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm --filter @informach/db db:migrate
      - run: pnpm --filter @informach/cozya exec playwright install --with-deps chromium
      - run: pnpm --filter @informach/cozya e2e
      - run: pnpm build
```

CI **não** faz deploy. CI valida lint, tipos, testes unitários, migrations, E2E dos apps com suíte Playwright e build; CD é problema do provider.

---

## CD pelo Railway

Cada app vira um service no mesmo project Railway, todos apontando para o mesmo repositório GitHub.

O portal Edi e `cron-edi-reconcile` usam a configuração IaC `.railway/railway.ts`, com parcial nomeada `edi` e validação dos IDs do projeto/ambiente. A API atual rejeitou a associação de um novo `railway.toml` ao Edi em 17/10/2026; as configurações legadas dos demais serviços continuam preservadas. A parcial permite uma adoção gradual, sem declarar ou recriar Postgres/Redis e sem assumir a configuração dos outros apps. Alterações na IaC exigem `railway config plan` e revisão antes de `railway config apply`, conforme o [runbook do Edi](../apps/edi/PRODUCAO.md#serviço-railway); o push de código não substitui essa aplicação.

Configuração por app:
- **Root directory**: `/` (raiz do monorepo). Necessário porque o app depende de `packages/*`.
- **Build command**: `pnpm install --frozen-lockfile && pnpm build:<app>`.
- **Start command**: `pnpm start:<app>`.
- **Watch paths**: `apps/<app>/**`, `packages/**`. Evita rebuild quando outro app muda.
- **Porta e interface**: escutar em `0.0.0.0` e respeitar o `PORT` injetado pelo Railway. O target port do domínio e a porta do healthcheck devem coincidir com o serviço; não impor `8080` ou uma porta local como regra universal. [Healthcheck e PORT](https://docs.railway.com/deployments/healthchecks).
- **Variáveis**: específicas por app. `DATABASE_URL` referenciada do service Postgres (`${{Postgres.DATABASE_URL}}`).

Postgres é um service só, compartilhado por todos os apps. Redis (se houver workers) idem.

Domínios sugeridos: `<app>.<org>.com.br` por app, opcionalmente `auth.<org>.com.br` para um eventual portal de auth central.

---

## Quando criar um package novo

Sinal forte: dois apps precisam da mesma lógica. Antes disso, o código mora dentro do app que o usa.

Sinal fraco mas válido: a lógica é fundação não-funcional (logger, result type, env helper) que faz sentido isolar mesmo no primeiro app.

Não criar: utilidade usada por um app só. Premature extraction custa mais que duplicação.

---

## Anti-patterns

- Package que importa de um app.
- Ciclo de dependência entre packages.
- App que mexe direto numa schema SQL fora do package `db`.
- Package versionado com `dist/` no git (consumimos TS direto via `transpilePackages` do Next).
- Migration rodando no `start` de um app.
- Variável de ambiente compartilhada com nome genérico (`API_URL`) — deve ser nomeada por dono (`AUTH_API_URL`).
- Path alias global apontando para outro workspace (`@/db/*` resolvendo `packages/db/`). Use o nome do pacote.
- App acessando feature de outro app por convenção de URL (acoplamento invisível). Se precisa, vira evento ou API explícita.

---

## Exemplo aplicado

Como a referência se materializa em um caso real (org `informach`):

```
informach-platform/
├── apps/
│   ├── admin/                  # @informach/admin (scaffold; sem auth/billing/db por enquanto)
│   ├── agenda-da-turma/        # @informach/agenda-da-turma
│   └── cozya/                  # @informach/cozya
└── packages/
    ├── db/                     # @informach/db (drizzle, schemas core/billing/agenda/cozya/audit/ai)
    ├── auth/                   # @informach/auth (Better Auth: RBAC, passkeys, organizations)
    ├── billing/                # @informach/billing (Stripe: subscriptions + credit ledger)
    ├── ui/                     # @informach/ui (shadcn + Tailwind v4 tokens)
    ├── config/                 # @informach/config (constantes)
    ├── emails/                 # @informach/emails (SendGrid + React Email + sweepers)
    └── ai-core/                # @informach/ai-core (primitivas IA)
```

Três apps independentes no Railway, cada um com seu domínio (`admin.informach.com.br`, etc.). `agenda-da-turma` e `cozya` consomem `@informach/db`/auth/billing/emails; `admin` só deve entrar nesse grupo quando tiver rota `/api/auth`, observabilidade e wiring próprios. Substitua `informach` por qualquer outra org e a estrutura permanece.

---

## Referências

- [`arquitetura-apps.md`](./arquitetura-apps.md) — o que vai dentro de `apps/<app>/`.
- [`arquitetura-packages.md`](./arquitetura-packages.md) — o que vai dentro de `packages/<pkg>/`.
