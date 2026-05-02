# Arquitetura dos packages compartilhados

Como cada `packages/<pkg>` se organiza, o que vira package vs. o que mora dentro do app, e como packages evoluem sem quebrar consumidores. Para o monorepo como um todo, ver [`arquitetura-monorepo.md`](./arquitetura-monorepo.md). Para o uso desses packages dentro de um app, ver [`arquitetura-apps.md`](./arquitetura-apps.md).

---

## O que é um package

Biblioteca **interna**. Consumida pelos apps via pnpm workspace (`"workspace:*"`). Nunca deployada como serviço. Nunca publicada no npm (`"private": true`). TypeScript consumido direto pelos apps via `transpilePackages` do Next — **sem build step, sem `dist/` versionado**.

Existir é justificável quando:
- Dois ou mais apps precisam da mesma lógica;
- Ou a lógica é fundação não-funcional (logger, result type, env helper) e isolar deixa os apps mais limpos desde o primeiro consumidor.

Não existir quando: um app só usa. Premature extraction custa mais que duplicação.

---

## Convenções

### `package.json`

```jsonc
{
  "name": "@<org>/<pkg>",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./components/*": "./src/components/*.tsx",
    "./styles.css": "./src/styles.css"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@<org>/db": "workspace:*"
  }
}
```

- `"private": true` sempre.
- `"main"`/`"types"` apontam para `src/index.ts` (TS direto).
- `"exports"` declara o que é público. Sub-paths não listados não são acessíveis pelos consumidores.
- Sem `"build"` ou `"dev"`. Apenas `"typecheck"`. Outros scripts caso a caso (ex: `db` tem `db:generate`, `db:migrate`).

### `tsconfig.json`

Estende `tsconfig.base.json` da raiz, declara `paths` locais se necessário, `include: ["src"]`.

### Public API

Tudo que é público sai por `src/index.ts`. Subpastas (`src/components/`, `src/lib/`, etc.) ficam acessíveis só se listadas em `exports`. Isso evita vazamento de detalhes de implementação.

### Sem `console.log`

Use `logger`/hooks opcionais definidos pelo contrato do próprio package quando houver emit-points. Package nunca grita no stdout dos consumidores e não importa Sentry/pino; o app decide como encaminhar logs.

### Sem `next/*`

Package não importa de Next.js. Acopla a Next quando não precisa. Server Actions moram no app que as roteia, não no package.

**Exceção: adapters Next em sub-paths `server-only`.** Packages de domain integration podem precisar oferecer wrappers para RSC, route handlers, `proxy.ts` (Next 16) ou factories de server actions. Quando isso acontece, é aceitável importar de `next/*` desde que **todas** as condições abaixo sejam respeitadas:

- O arquivo afetado vive em um sub-path declarado em `exports` (ex: `./server`, `./proxy`, `./server-actions`) — nunca no root (`.`).
- O arquivo começa com `import "server-only"` para falhar em build se importado de Client Component.
- `next` é declarado como `peerDependency` opcional (`peerDependenciesMeta.next.optional: true`), não como `dependency` direta.
- O sub-path expõe uma **factory** ou helper, não Server Actions concretas — Server Actions continuam morando no app que as roteia.

Exemplo real: `@informach/auth/proxy` (`createAuthProxy`), `@informach/auth/server` (`createServerHelpers`), `@informach/auth/server-actions` (`createActionFactory`). Root `@informach/auth` permanece Next-free.

---

## Categorias de packages

Cinco grupos consolidados. Cada novo package se encaixa em uma dessas categorias antes de ser criado.

### 1. Data layer — `db`

Único package que conhece o schema completo do banco.

- ORM: **Drizzle**. Driver: **postgres-js** (`drizzle-orm/postgres-js`). Mais leve que `pg` em Node.
- Schemas SQL nativos por domínio via `pgSchema("nome").table(...)`. Exemplos: `core`, `<dominio_app_1>`, `<dominio_app_2>`, `audit`, `ai`.
- Client singleton em `src/client.ts` com guard no `globalThis` para sobreviver a hot reload.
- `drizzle.config.ts` com `dialect: "postgresql"`, `schema: "./src/schema/index.ts"`, `out: "./src/migrations"`, `schemaFilter: ["core","<dominio_app_1>",...]` para que o `drizzle-kit` só toque nas schemas geridas.
- Migrations geradas por `drizzle-kit generate`, aplicadas por `drizzle-kit migrate` ou script `migrate.ts` (chamado manualmente ou por job dedicado, **nunca** no start de um app).
- Repository pattern: funções nomeadas por feature, exportadas via re-export no `index.ts`. Sem `Repo<T>` genérico — overengineering.

Layout:

```
packages/db/
├── drizzle.config.ts
├── package.json
├── tsconfig.json
└── src/
    ├── client.ts
    ├── index.ts
    ├── migrate.ts
    ├── migrations/
    └── schema/
        ├── core.ts
        ├── <dominio_app_1>.ts
        ├── <dominio_app_2>.ts
        ├── audit.ts
        ├── ai.ts
        └── index.ts
```

Esquema de uma schema SQL:

```ts
// src/schema/core.ts
import { pgSchema, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const core = pgSchema("core");

export const users = core.table("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

Cliente:

```ts
// src/client.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const g = globalThis as unknown as { pg?: ReturnType<typeof postgres> };
const client = g.pg ?? postgres(process.env.DATABASE_URL!, { max: 10, prepare: false });
if (process.env.NODE_ENV !== "production") g.pg = client;

export const db = drizzle(client, { schema });
```

### 2. Domain integration — `auth`, `billing`, `emails`, `payments-<provider>`

Wrappers de integrações externas atrás de uma interface estável. Apps consomem a interface; troca de provider é problema interno.

- **`auth`**: `getCurrentUser`, `requireUser`, `hasAccessToProduct`, `hasRole`, `assertPermission`. Implementação real (Better-Auth, Auth.js, Clerk, Keycloak) plugada por dentro. Apps nunca veem o provider.
- **`billing`**: `createCheckout`, `handleBillingWebhook`, `getUserSubscription`, `grantProductAccess`, `revokeProductAccess`, `syncBillingCustomer`. Tipos: `ProductId`, `CheckoutInput`, `CheckoutResult`, `SubscriptionStatus`, `BillingProvider`, `PaymentStatus`. Depende de `db`.
- **`emails`**: `sendEmail`, `sendWelcomeEmail`, `sendPaymentConfirmationEmail`, `sendAccessGrantedEmail`. Provider real (Resend, SendGrid) plugado por dentro.

Padrão de "placeholder primeiro": ao criar o package, as funções públicas existem com tipos certos mas lançam `NotImplementedError` ou retornam mock controlado. Ponto de integração pronto, contrato fixado, implementação real entra depois sem mexer nos consumidores.

### 3. UI / design system — `ui`

Componentes shadcn compartilhados, tokens Tailwind v4, ícones.

- shadcn instalado via CLI apontando para o package. `components.json`:

  ```json
  {
    "$schema": "https://ui.shadcn.com/schema.json",
    "style": "default",
    "rsc": true,
    "tsx": true,
    "tailwind": {
      "config": "",
      "css": "../../packages/ui/src/styles.css",
      "baseColor": "neutral",
      "cssVariables": true
    },
    "iconLibrary": "lucide",
    "aliases": {
      "utils": "@<org>/ui/lib/utils",
      "ui": "@<org>/ui/components"
    }
  }
  ```

  Atenção: `tailwind.config: ""` (vazio) é a configuração correta para Tailwind v4 — confirmado via Context7. CSS vars ativas, baseColor neutral, ícones lucide.

- `src/styles.css` com `@theme` (tokens de cor, fonte, raio, espaçamento) e `@layer base`. Apps importam esse arquivo e adicionam `@source` apontando para o package.
- `src/lib/utils.ts` com `cn()` (clsx + tailwind-merge).
- Componentes em `src/components/`. Importação dos consumidores: `import { Button } from "@<org>/ui/components/button"`.
- Ícones: `lucide-react`. Único provider; não misturar.

Layout:

```
packages/ui/
├── components.json
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── styles.css
    ├── lib/utils.ts
    └── components/
        ├── button.tsx
        ├── card.tsx
        ├── input.tsx
        ├── page-shell.tsx
        └── empty-state.tsx
```

### 4. Cross-cutting infra — `result`, `errors`, adapters de observabilidade

Pequenos packages ou contratos sem dependência externa pesada, expõem tipos e helpers usados em toda parte.

- **`result`**: `Result<T, E>`, `ok(value)`, `err(error)`, helpers `unwrap`, `map`, `flatMap`. Tipo de retorno padrão dos services.
- **`errors`**: classes-base (`DomainError`, `InfraError`) e erros comuns (`ForbiddenError`, `NotFoundError`, `ConflictError`).
- **Observabilidade**: hoje é app-owned. Packages expõem contratos (`Logger`, `ObservabilityHooks`, callbacks como `onAudit`) e os apps adaptam isso em `apps/<app>/src/lib/observability.ts`. Sentry, pino, sampling e logs são configuração do app, não dependência de package. Só criar `packages/observability` se houver um segundo consumidor real para helpers provider-neutral de tracing/logger.

### 5. Constantes — `config`

Listas estáticas, sem lógica:

- Apps disponíveis e seus metadados (slug, nome público, domínio).
- Produtos e SKUs.
- Domínios sugeridos por ambiente.
- Feature flags estáticas (ligadas/desligadas em build, não dinâmicas).

Layout:

```
packages/config/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── apps.ts        # APPS = { admin: {...}, agendaDaTurma: {...}, ... }
    ├── products.ts
    └── domains.ts
```

### 6. AI primitives — `ai-core`

Tipos e helpers compartilhados para apps que rodam agentes. **Não é um serviço.** Não roda nada por conta própria. Cada app instancia agentes em `apps/<app>/src/ai/` consumindo essas primitivas.

Layout:

```
packages/ai-core/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── types.ts
    ├── models/index.ts
    ├── memory/index.ts
    ├── tools/index.ts
    ├── guardrails/index.ts
    ├── telemetry/index.ts
    └── prompts/index.ts
```

Tipos: `AppName`, `AgentName`, `AgentRunStatus`, `TokenUsage`, `AiRuntimeConfig`, `ToolContext`. Helpers: `getDefaultModelConfig`, `createAppMemoryConfig`, `createToolContext`, `traceAgentRun`, `calculateTokenUsage`, `createAgentRunLogger`.

---

## Inter-package dependencies

Declaradas em `package.json` com `"workspace:*"`. Exemplos típicos:

- `auth` → `db`, `emails`. (Erros declarados inline até existir um segundo consumidor — ver §"Quando NÃO criar um package".)
- `billing` → `db`, `auth`, `emails`, `config`. Observabilidade entra por `logger`/`onAudit` injetados pelo app. (Quando `billing` precisar das mesmas classes-base de erro de `auth`, é o momento certo de extrair `packages/errors/`.)
- `emails` → `db`.
- `ui` → (sem deps internas).
- `ai-core` → `db` (para `agent_runs`, `messages`, `tool_calls`, `usage_logs` em `schema/ai`) e `billing` (para o ciclo reserve/commit/release de créditos). Telemetria permanece provider-neutral; exportar para APM é responsabilidade do app.

Ciclos proibidos. Turborepo detecta na build.

---

## Quando dividir um package em dois

Sinal: a public surface area tem dois grupos de consumidores que não dependem do mesmo subset, e um deles paga custo (bundle, peer deps, complexidade) pela existência do outro.

Exemplo concreto: `billing` orquestra; `payments-stripe` e `payments-asaas` são adapters específicos. Apps que só usam Stripe não importam Asaas, e o `billing` core fica magro.

---

## Quando NÃO criar um package

- Um app só usa. Mantém dentro do app.
- Lógica que muda por app, mesmo nome (ex: "regras de validação"). Cada app tem as suas; não force um package com switch por app.
- Adapter de uma única dependência externa que faz o que o SDK já faz (`mailgun-wrapper` em volta de `mailgun-js`). Use o SDK direto via `emails` se tiver mesmo um package.

---

## Versionamento

`workspace:*` resolve sempre para a versão local. Sem semver entre packages internos. Sem changelog. Sem release.

Quebras de contrato são consertadas no PR que as introduz, **em todos os apps consumidores**, antes do merge. Esse é o custo de viver no monorepo — e o motivo dele existir: refatoração transversal num PR.

---

## Anti-patterns

- Package com `dist/` versionado no git.
- Package que exporta tudo de `src/*` (vaza implementação). Use `exports` explícito.
- Server Action dentro de package. Server Action mora no app que a roteia.
- Package importando `next/*`. Acopla a Next sem motivo.
- `console.log` em código de package.
- `process.env.X` lido direto em package. Receba via parâmetro ou exija que o app injete (`createClient({ url })`).
- `index.ts` re-exportando 50 itens sem critério. Index é a public API, não despejo.
- Package "utils" que cresce sem dono. Se virar lixeira, divide ou mata.
- Acoplar package a um framework de teste específico. Package de domínio não deveria saber se vai ser testado com Vitest ou Jest.
- Versão diferente de uma mesma dependência em packages diferentes. Centralize via `pnpm.overrides` na raiz quando preciso.

---

## Quando criar um package novo

Sinal forte:
- Dois apps precisam da mesma lógica.
- Lógica é fundação não-funcional óbvia (logger, result, env).
- Integração externa que vai mudar de provider (esconde atrás de interface).

Sinal fraco:
- "Vai ser útil em breve". Não cria. Espera o segundo consumidor real.

Quando criar, replique a estrutura padrão (`package.json` privado, `tsconfig` estendendo base, `src/index.ts` como public API, `typecheck` script) e adicione ao Turborepo automaticamente via `pnpm-workspace.yaml` (já cobre `packages/*`).

---

## Referências

- [`arquitetura-monorepo.md`](./arquitetura-monorepo.md) — o monorepo como um todo.
- [`arquitetura-apps.md`](./arquitetura-apps.md) — como os apps consomem esses packages.
