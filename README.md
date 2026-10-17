# informach-platform

Monorepo pnpm + Turborepo para produtos web e ferramentas desktop da Informach.
Os apps vivem em `apps/`; os web apps têm serviços separados no Railway, e as
ferramentas Edi usam o fluxo próprio de distribuição desktop. Os packages vivem
em `packages/` e são bibliotecas internas consumidas como TypeScript fonte, sem
`dist/` versionado.

Antes de trabalhar, leia o [AGENTS.md](AGENTS.md), guia permanente do repositório,
e o [estado do trabalho](docs/estado-do-repositorio.md). O `CLAUDE.md` também
direciona para essas referências. Atualizar a documentação faz parte de cada
mudança de arquitetura, integração ou operação.

## Stack

- Node.js `24.15.0+` conforme `engines` em [package.json](package.json); CI usa `24.15.0`
- pnpm `9.15.0`
- Turborepo `2.x`
- TypeScript `5.x`
- Next.js `16.x` App Router
- React `19.x`
- Tailwind CSS `4.x`
- Biome `2.x` para lint e format
- Drizzle ORM + PostgreSQL; Docker local usa 16 e o runner isolado Edi usa 18.4
- Redis opcional para storage secundário do auth
- Railway como alvo de deploy

## Workspaces

### Apps

| App | Package | Porta local | Status |
| --- | --- | --- | --- |
| `admin` | `@informach/admin` | `3003` | Scaffold, sem wiring completo de auth/billing/db |
| `agenda-da-turma` | `@informach/agenda-da-turma` | `3001` | Titular, perfis de crianças e adultos convidados; sem Better Auth organizations |
| `cozya` | `@informach/cozya` | `3002` | App single-user |
| `missao-saber` | `@informach/missao-saber` | `3005` | Produto comercial autoral para olimpíadas, com perfis familiares e assinatura; [operação](apps/missao-saber/README.md) |
| `informach-site` | `@informach/informach-site` | `3004` | Site institucional, termos e privacidade |
| `edi` | `@informach/edi` | `3006` | Portal da suíte; implantação Railway e homologação pendentes; [operação](apps/edi/PRODUCAO.md) |
| `edi-hub` | `@informach/edi-hub` | — | Central desktop da suíte, em integração |
| `ediaula`, `edicaptura`, `edifoto`, `edipdf`, `edisvg` | `@informach/<ferramenta>` | — | Cinco apps Electron em desenvolvimento; [padrão](docs/arquitetura-desktop.md) |

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
| `@informach/edi-contracts` | Contratos públicos de licença, dispositivo e distribuição |
| `@informach/edi-desktop` | SDK Electron de sessão, licença, arquivos, integridade e atualização |
| `@informach/edi-licensing` | Política comercial e licenças, exclusiva do servidor |
| `@informach/edi-releases` | Catálogo público de instaladores com verificação de assinatura |

## Setup Local

1. Use a versão Node do manifest/CI. Neste estado do repositório:

   ```powershell
   nvm use 24.15.0
   ```

   O `.nvmrc`, o requisito do manifest e a CI estão alinhados em `24.15.0`.
   Instale essa versão se ela não estiver disponível.

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
   pnpm dev:missao-saber
   pnpm dev:admin
   pnpm dev:edi
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
| `pnpm db:migrate` | Aplica migrations Drizzle, executa o backfill de tarefas e inicializa o storage Mastra |
| `pnpm db:studio` | Abre Drizzle Studio |
| `pnpm db:push` | Push direto do schema Drizzle, nunca em produção |

Atalhos web por app seguem o padrão `dev:<app>`, `build:<app>` e `start:<app>`.
Nos desktops, usar os scripts disponíveis no próprio workspace, por exemplo
`pnpm --filter @informach/edi-hub dev`. Consultar o manifest antes de executar.

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
- `missao_saber`
- `edi`

O schema `ai_mastra` é exceção: ele pertence ao Mastra e fica fora do
`schemaFilter` do Drizzle. A migration do repo cria o schema vazio; o migrator
`pnpm db:migrate` também executa o backfill de tarefas e chama
`PostgresStore.init()` para criar/atualizar as tabelas `mastra_*` fora do runtime
dos apps. Migrations em produção passam pelo migrator compartilhado e pela
barreira de readiness descritos no runbook.

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

Os workflows Edi acrescentam integração com PostgreSQL isolado, verificação
nativa Windows e o pipeline de release dos seis aplicativos. O release desktop
é disparado por tag/release `edi-v*`, não por qualquer push de código. Estado,
limites e homologações pendentes estão no [registro Edi](docs/propostas/edi-suite-2026-10-16/implementacao.md).

## Documentação

- [AGENTS.md](AGENTS.md): entrada comum para agentes, contexto permanente e regra de manutenção documental
- [docs/estado-do-repositorio.md](docs/estado-do-repositorio.md): frente atual, decisões e continuidade entre sessões
- [docs/arquitetura-monorepo.md](./docs/arquitetura-monorepo.md): stack, layout, CI/CD e regras globais
- [docs/arquitetura-apps.md](./docs/arquitetura-apps.md): estrutura interna dos apps Next.js
- [docs/arquitetura-desktop.md](./docs/arquitetura-desktop.md): padrão de desenvolvimento, segurança e distribuição das ferramentas desktop
- [docs/arquitetura-packages.md](./docs/arquitetura-packages.md): contratos dos packages compartilhados
- [docs/audit-payload-policy.md](./docs/audit-payload-policy.md): política de payloads de auditoria
- [docs/adr/0001-uso-de-monorepo.md](./docs/adr/0001-uso-de-monorepo.md): decisão arquitetural do monorepo
- [docs/deploy-runbook.md](docs/deploy-runbook.md): operação compartilhada no Railway e provedores
- [apps/edi/PRODUCAO.md](apps/edi/PRODUCAO.md): implantação e operação do portal Edi

Guias profundos por package:

- [packages/auth/CLAUDE.md](./packages/auth/CLAUDE.md)
- [packages/billing/CLAUDE.md](./packages/billing/CLAUDE.md)
- [packages/emails/CLAUDE.md](./packages/emails/CLAUDE.md)
- [packages/ai-core/CLAUDE.md](./packages/ai-core/CLAUDE.md)
