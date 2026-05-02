# informach-platform

Monorepo pnpm + Turborepo para produtos web da Informach. Os apps vivem em
`apps/` e são deployados separadamente; os packages vivem em `packages/` e são
bibliotecas internas consumidas como TypeScript fonte, sem `dist/` versionado.

## Stack

- Node.js `22.13.0+` conforme [.nvmrc](./.nvmrc)
- pnpm `9.15.0`
- Turborepo `2.x`
- TypeScript `5.x`
- Next.js `16.x` App Router
- React `19.x`
- Tailwind CSS `4.x`
- Biome `2.x` para lint e format
- Drizzle ORM + PostgreSQL 16
- Redis opcional para storage secundário do auth
- Railway como alvo de deploy

## Workspaces

### Apps

| App | Package | Porta local | Status |
| --- | --- | --- | --- |
| `admin` | `@informach/admin` | `3003` | Scaffold, sem wiring completo de auth/billing/db |
| `agenda-da-turma` | `@informach/agenda-da-turma` | `3001` | App multi-tenant com Better Auth organizations |
| `cozya` | `@informach/cozya` | `3002` | App single-user |

### Packages

| Package | Papel |
| --- | --- |
| `@informach/db` | Drizzle, schemas SQL e migrations |
| `@informach/auth` | Better Auth, RBAC, helpers server/proxy/actions |
| `@informach/billing` | Stripe, subscriptions, credit ledger e reservas |
| `@informach/emails` | SendGrid, React Email, webhook e sweepers |
| `@informach/ai-core` | Mastra, providers AI SDK, billing wrapper e telemetria IA |
| `@informach/config` | Constantes compartilhadas |
| `@informach/ui` | Design system, shadcn/ui e tokens Tailwind |

## Setup Local

1. Use Node 22.13+.

   ```powershell
   nvm use
   ```

2. Ative a versão esperada do pnpm.

   ```powershell
   corepack enable
   corepack prepare pnpm@9.15.0 --activate
   ```

3. Instale as dependências.

   ```powershell
   pnpm install
   ```

4. Crie o `.env` local a partir do exemplo da raiz.

   ```powershell
   Copy-Item .env.example .env
   ```

   O `DATABASE_URL` e o `REDIS_URL` do exemplo apontam para os serviços do
   `docker-compose.yml`. Para fluxos que chamam Stripe, SendGrid, Sentry ou
   providers IA, preencha as chaves correspondentes ou use placeholders quando
   estiver apenas validando build/typecheck.

5. Suba Postgres e Redis locais.

   ```powershell
   docker compose up -d
   ```

6. Aplique as migrations.

   ```powershell
   pnpm db:migrate
   ```

7. Rode um app.

   ```powershell
   pnpm dev:agenda-da-turma
   pnpm dev:cozya
   pnpm dev:admin
   ```

## Comandos

| Comando | O que faz |
| --- | --- |
| `pnpm dev` | Roda `turbo dev` para os workspaces |
| `pnpm build` | Build via Turborepo |
| `pnpm typecheck` | Typecheck via Turborepo |
| `pnpm test` | Testes via Turborepo |
| `pnpm check` | Biome check no repo todo |
| `pnpm lint` | Biome lint |
| `pnpm format` | Biome format com write |
| `pnpm db:generate` | Gera migrations Drizzle |
| `pnpm db:migrate` | Aplica migrations via `@informach/db` |
| `pnpm db:studio` | Abre Drizzle Studio |
| `pnpm db:push` | Push direto do schema Drizzle |

Comandos por app seguem o padrão `dev:<app>`, `build:<app>` e `start:<app>`.

```powershell
pnpm dev:agenda-da-turma
pnpm build:cozya
pnpm start:admin
```

Para rodar checks focados em um workspace:

```powershell
pnpm --filter @informach/ai-core typecheck
pnpm --filter @informach/billing test
```

## Banco e Migrations

O package `@informach/db` é a fonte de verdade do schema. Os apps não rodam
migrations no start.

Schemas geridos pelo Drizzle:

- `core`
- `billing`
- `audit`
- `ai`
- `agenda`
- `cozya`

O schema `ai_mastra` é exceção: ele pertence ao Mastra e fica fora do
`schemaFilter` do Drizzle. A migration do repo cria apenas o schema vazio; as
tabelas `mastra_*` são inicializadas pelo Mastra na primeira chamada.

Fluxo normal para mudanças de schema:

```powershell
pnpm db:generate
pnpm db:migrate
```

## Regras de Arquitetura

- Apps importam packages; apps não importam outros apps.
- Packages não importam de apps.
- Packages são consumidos como TS fonte via `exports`, sem build step próprio.
- Variáveis de ambiente são validadas no app e injetadas em factories; packages
  não devem ler `process.env` diretamente.
- Server Actions moram nos apps, não em packages.
- Sub-paths que dependem de Next ou Mastra devem ser `server-only`.
- Chamadas LLM pagas devem usar `withCredits` de `@informach/ai-core`, mantendo
  o mesmo `runId` entre billing, `ai.agent_runs` e Mastra traces.
- Payloads de audit devem seguir [docs/audit-payload-policy.md](./docs/audit-payload-policy.md).

## CI

O GitHub Actions roda em push e pull request para `main`:

```text
pnpm install --frozen-lockfile
pnpm check
pnpm typecheck
pnpm test
pnpm build
```

O build de CI usa variáveis placeholder para validar compilação sem depender de
serviços externos reais.

## Documentação

- [docs/arquitetura-monorepo.md](./docs/arquitetura-monorepo.md): stack, layout, CI/CD e regras globais
- [docs/arquitetura-apps.md](./docs/arquitetura-apps.md): estrutura interna dos apps Next.js
- [docs/arquitetura-packages.md](./docs/arquitetura-packages.md): contratos dos packages compartilhados
- [docs/audit-payload-policy.md](./docs/audit-payload-policy.md): política de payloads de auditoria
- [docs/adr/0001-uso-de-monorepo.md](./docs/adr/0001-uso-de-monorepo.md): decisão arquitetural do monorepo

Guias profundos por package:

- [packages/auth/CLAUDE.md](./packages/auth/CLAUDE.md)
- [packages/billing/CLAUDE.md](./packages/billing/CLAUDE.md)
- [packages/emails/CLAUDE.md](./packages/emails/CLAUDE.md)
- [packages/ai-core/CLAUDE.md](./packages/ai-core/CLAUDE.md)
