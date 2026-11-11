# Arquitetura dos packages compartilhados

A identidade web é administrada por `@informach/auth` na central. A troca de e-mail usa prova dos dois endereços e autenticação recente; a revogação de raízes web, provas antigas e convites familiares para o endereço liberado acompanha atomicamente a alteração no banco (0137). Responsabilidades, perfis e contratos mantêm IDs. `billing` conserva a elegibilidade do teste por identidade, além do digest durável de e-mail (0136). Contato fiscal não é uma cópia automática do login. Estado do ciclo completo de dados no [plano de privacidade](propostas/assinatura-web-2026-11-09/privacidade-conta.md).

O ciclo comercial do Compasso permanece em `@informach/billing`: `compasso-commerce` coordena contrato e snapshots, `credit-purchases` mantém recibos recuperáveis das recargas, `collection-jobs` mantém eventos mínimos e fila versionada, e `compasso-account` expõe projeções financeiras sem conteúdo pessoal. Todos reutilizam o motor de períodos pagos, carteira, reservas e financiamento. `apps/conta` fornece configuração/provedores, interface e adapters de HTTP. Clientes ainda legados não podem despachar eventos do mesmo customer Compasso. A [implementação](propostas/assinatura-web-2026-11-09/implementacao.md) registra quais consumidores já foram convertidos.

`@informach/account` compõe visão da conta, pessoas autorizadas, cobertura Compasso e saldo, recebendo banco por configuração. A central `apps/conta` é seu primeiro consumidor. A composição não cria uma segunda regra de família ou cobrança: delega aos packages `family` e `billing`. Contratos e estado de integração em [packages/account](../packages/account/README.md).

`account/departure-reviews` coordena avaliações temporárias de leitura por domínio, em PostgreSQL, com manifesto derivado do catálogo, posse de execução limitada e recibos protegidos contra respostas atrasadas. Os apps implementam a inspeção em seus próprios repositories e fixam o identificador na composição do worker. `family/departure` fornece a projeção comum de responsabilidade para os perfis; pagamento ou autoria histórica não substituem a concessão. Respostas contêm somente presença/contagem, nunca conteúdo, chaves ou mensagens de erro. Avaliação completa não significa permissão de exclusão; congelamento e execução irreversível são contratos separados.

`auth/web-participation` é a autoridade de participação web, separada da identidade e do Edi/Bastidores. `family` e os recibos Compasso de `ai-core` consomem suas travas transacionais e revisão. A participação congelada/encerrada não concede acesso por login antigo, contexto familiar ou resposta tardia. O coordenador `account` deve persistir o pedido e autorizar cada transição; não tomar travas dos domínios na transação que congela a participação. Contrato em [auth](../packages/auth/CLAUDE.md#participação-web-e-congelamento). Os consumidores pessoais e capacidades de aparelhos/calendários integram a participação e sua revisão. `currentWebParticipationCondition` usa subconsulta tipada para conservar correlação tanto em filtros como em projeções. O núcleo durável `account/closure` está implementado (0145): preparação congelada, consentimento, etapas com posse/recibos atômicos e retomada segura. Adapters e composição pública seguem em integração. `family/closure` seleciona ativações por concessão atual e preserva históricos compartilhados, sem usar autoria nativa como propriedade; verificações e limites estão no registro da frente.

`account/privacy` compõe a exportação comum paginada; `billing/privacy` fornece somente fatos financeiros do próprio pagante. Sessão e auditoria são políticas da composição HTTP; os domínios revalidam a autoridade das linhas. Conteúdo dos apps fica nas exportações locais. `family` coordena pedidos versionados de transferência do cadastro com aceite do destinatário, preservando concessões locais. Mutações de identidade travam grupo e pessoa, inclusive entre contextos. `account/departure` compõe os inventários `family/departure`, `billing/departure` e `auth/identity-dependencies`, somente de leitura. Eles não executam encerramento nem autorizam apagar dados; o executor precisará revalidar fatos e avaliar os domínios locais antes de congelar a operação.

`@informach/billing/credit-migration` é a fronteira para transferir carteiras pessoais antigas para a família escolhida. Prévia e confirmação não decidem preços: usam a política imutável de `config`, reconciliam proveniência e conservam lotes/validade. Recibos encerram a autoridade da origem no banco e roteiam eventos financeiros tardios pelo motor existente. O vínculo de franquias com faturas é mantido pelo reconciliador de financiamento compartilhado. A interface só recebe projeções próprias para apresentação; detalhes, locks e rollback em [migração financeira](propostas/assinatura-web-2026-11-09/migracao-financeira.md).

Como cada `packages/<pkg>` se organiza, o que vira package vs. o que mora dentro do app, e como packages evoluem sem quebrar consumidores. Para o monorepo como um todo, ver [`arquitetura-monorepo.md`](./arquitetura-monorepo.md). Para o uso desses packages dentro de um app, ver [`arquitetura-apps.md`](./arquitetura-apps.md).

---

A recuperação de chamadas pagas do Compasso usa `@informach/ai-core/operations`: recibo privado temporário em `ai.operation_receipts`, autorização transacional fornecida pelo domínio, `runId` ligado à reserva e confirmação por fato financeiro. Agenda e Cozya consomem; implantação e corte financeiro permanecem pendentes. O package não decide quem pode ler um perfil e não envia conteúdo a logs. `/vision-image` decodifica e limita imagens no servidor, sem depender do cliente; `/vision-image-build` declara os assets nativos Sharp exigidos pelo standalone Next dos consumidores. Contrato e retenção no [guia de IA](../packages/ai-core/CLAUDE.md).

## O que é um package

### Identidade familiar e conjuntos comerciais

A [migração Compasso](propostas/assinatura-web-2026-11-09/implementacao.md) introduz `@informach/family`, consumido pelo billing compartilhado e destinado aos quatro apps com perfis. O package opera o schema `family` de `@informach/db`: grupos estáveis, membros adultos, pessoas, participação da pessoa no grupo, ativações por app e concessões por ação. Pagante não é chave do grupo nem autorização de conteúdo. Nome de pessoa ligada a conta vem de `core.users`; demais nomes/cor/avatar comuns vêm de `family.people`. Dados específicos permanecem nos schemas dos apps. Migrations usam a proveniência de cada perfil; perfis de treino sem categoria são explicitamente `unclassified` até confirmação.

Os exports `/access` e `/context` permitem autorização dentro da consulta/transação consumidora. Escritas concorrentes de um grupo usam a mesma trava, incluindo a reserva de créditos da família. A associação entre pessoas conserva a ativação e os históricos e exige confirmação e responsabilidade pelas duas identidades. Administração não concede leitura ou custódia. Convite de adulto não replica automaticamente concessões das crianças. `activateProfileInTransaction` permite compor onboarding de várias pessoas e dados de domínio em uma única transação; falha em qualquer callback desfaz ativações e concessões anteriores. `removeProfileInTransaction` também permite excluir histórico arquivado mediante gestão atual, sem reabrir o acesso ao conteúdo. Os predicados aceitam identificador do ator ou expressão SQL construída no servidor (para jobs/contagens); nunca texto SQL fornecido pelo cliente.

`@informach/config/collections` deriva a lista de apps do catálogo `APPS` e contém a política comercial aprovada. `@informach/billing` conserva um único motor de extrato/reserva: o escopo comercial da carteira é independente do consumidor. O corte dos apps, a central e a migração financeira continuam sujeitos aos gates registrados na frente; a presença desses packages não comprova ativação em produção.

`@informach/config/products` também declara os nomes das variáveis de preços Stripe. `getConfiguredProducts` resolve apenas as variáveis do app solicitado e altera somente o identificador do modo atual; valores comerciais e créditos continuam no catálogo. Missão Saber, Bora Treinar, Dia de Estrela e Conta usam esse contrato. As referências temporárias a preços legados atendem ao preparo do corte interno; não inferir correspondências pelo valor. Em 10/11 o titular esclareceu que existem apenas dois desenvolvedores testando, sem clientes externos pagantes. A transição comercial gradual foi retirada do escopo de execução: o corte direto preserva os dados internos úteis e deixa a cobrança nova no motor Compasso.

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
- Schemas SQL nativos por domínio via `pgSchema("nome").table(...)`. Exemplos atuais: `core`, `billing`, `audit`, `ai`, `agenda`, `cozya`.
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

- **`auth`**: `createAuth`, helpers server/RSC/proxy/server-actions, RBAC, organizations opt-in, escolha por app de plugin de email (`config.email.{verification, signIn, forgetPassword}` — OTP vs link/magic-link), `logAuditEvent` e `ObservabilityHooks`. Provider atual: Better Auth; apps nunca importam Better Auth diretamente.
- **`billing`**: `createBillingService`, Checkout/Portal Stripe, subscriptions, plan changes (`switchPlan`/`reactivateSubscription`/`previewPlanChange`), Pro entitlement gate (`hasProSubscription` — single source of truth), credit ledger Pro-only com reserve/commit/release, drip mensal de créditos no plano anual via sweeper, webhooks (priceId-first resolution) e sweepers (reconcile, expire-bonus, grant-monthly, release-reservations, dunning). Audit entra por `config.onAudit`, wireado pelo app para `@informach/auth.logAuditEvent`.
- **`emails`**: `createEmailService`, `sendEmail`, `renderTemplate`, SendGrid webhook, unsubscribe, sweepers e `onAudit` opcional para eventos `email.*`. Provider atual: SendGrid.

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
- **Observabilidade**: hoje é app-owned. Packages expõem contratos (`Logger`, `ObservabilityHooks`, callbacks como `onAudit` e `onAuditPersistenceFailure`) e os apps adaptam isso em `apps/<app>/src/lib/observability.ts`. Sentry, pino, sampling e logs são configuração do app, não dependência de package. Só criar `packages/observability` se houver um segundo consumidor real para helpers provider-neutral de tracing/logger.

### 5. Constantes — `config`

Listas estáticas, sem lógica:

- Apps disponíveis e seus metadados (slug, nome público, domínio).
- Produtos e SKUs.
- Domínios sugeridos por ambiente.
- Feature flags estáticas (ligadas/desligadas em build, não dinâmicas).
- Canal público de contato (`INFORMACH_CONTACT`, direct do Instagram), lido por toda página que oferece contato. Páginas não mostram e-mail.

Layout:

```
packages/config/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── apps.ts        # APPS = { admin: {...}, agendaDaTurma: {...}, ... }
    ├── products.ts
    ├── domains.ts
    ├── edi-tools.ts   # ferramentas da Suíte Edi (ids, nomes, descrições)
    ├── edi-brand.ts   # cores e glifos das ferramentas Edi, usados pelo portal e pelo Hub
    └── contact.ts     # INFORMACH_CONTACT, exportado em "@informach/config/contact"
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
    ├── tools/index.ts
    ├── billing.ts
    ├── execution.ts
    ├── telemetry/index.ts
    ├── logger.ts
    ├── providers/index.ts
    ├── transcription.ts
    └── mastra/index.ts
```

Tipos: `AppName`, `AgentName`, `AgentRunStatus`, `AgentRunTerminalStatus`, `TokenUsage`, `AiRuntimeConfig`, `ToolContext`. Helpers: `withCredits`, `runRecordedAiCall`, `runBillableAiCall`, `computeCreditsFromUsage`, `createToolContext`, `createAgentRunRecorder`, `createDrizzleAgentRunStore`, `calculateTokenUsage`, `createDefaultLogger`, `createOpenRouter` (gateway preferido), `createAnthropic`, `createOpenAI`, `createMastra`, `createPostgresStore`, `createSharedMemory`, `createDefaultObservability`, `transcribeAudio` (sub-path `./transcription`, OpenAI-compatible — funciona com OpenRouter via `baseURL`).

`runBillableAiCall` é o caminho default para chamada paga simples: ele combina `withCredits`, retry, `AgentRunRecorder`, normalização de usage e `agent.generate({ runId })`. `withCredits` continua disponível para fluxos multiestágio; nesses casos, use uma reserva única e grave cada estágio com `runRecordedAiCall`. O UUID de reserva é usado como `credit_reservations.id`, `billing.credit_ledger.run_id`, `ai.agent_runs.id` e `agent.generate({ runId })` quando há uma única etapa.

Contratos fixos:

- Runtime mínimo: **Node.js 22.13+**, alinhado ao Mastra v1.
- Root export (`@<org>/ai-core`) é frame-agnostic e não importa Mastra nem providers. Mastra fica só no sub-path `@<org>/ai-core/mastra`, com `server-only`.
- `createPostgresStore` usa `PostgresStore` do Mastra com `id` fixo e schema `ai_mastra`; Drizzle continua dono apenas do schema `ai`. O comando raiz `pnpm db:migrate` chama o init oficial do Mastra fora do runtime dos apps. `createMastra` aceita `agents`, `workflows`, `storage`, `logger`, `scorers` e `observability`.
- `createOpenRouter`/`createAnthropic`/`createOpenAI` recebem `apiKey` por parâmetro (e `baseURL`/`headers` opcionais). Apps validam env em `lib/env.ts`; package compartilhado não lê `process.env`. OpenRouter é o gateway primário do projeto e também recebe `appName`, `appUrl`, `compatibility`, `extraBody` e `apiKeys` quando necessário — `createOpenAI`/`createAnthropic` continuam para casos de provider direto e para o Whisper apontado ao OpenRouter via `baseURL` em `transcribeAudio`.
- `createDefaultObservability` configura Mastra Observability com `DefaultExporter` e `SensitiveDataFilter`; `CloudExporter` só entra quando o app optar por enviar para Mastra Cloud.
- Token usage persistido/cobrado sempre usa o tipo interno `TokenUsage` (`promptTokens`, `completionTokens`, `totalTokens`). Se o provider expuser `inputTokens`/`outputTokens`, o app normaliza antes de chamar `computeCreditsFromUsage`.
- `AgentRunRecorder.finish` aceita apenas status terminal (`succeeded`, `failed`, `canceled`); `running` é estado de abertura via `start`.

### 7. Desktop Edi — `edi-*`

Packages da suíte Edi, consumidos pelos apps Electron e incluídos no build de cada um. Regras de fronteira, distribuição e instaladores em [`arquitetura-desktop.md`](./arquitetura-desktop.md).

- `edi-contracts`: contratos públicos puros. `edi-desktop`: integração local (main, preload, mídia, captura Windows). `edi-licensing`: regras do servidor. `edi-releases`: catálogo público assinado.
- `edi-licensing/identity-dependencies` fornece à composição da conta somente indicadores de presença de registros próprios. A leitura não limpa/revoga licenças, dispositivos, OAuth ou provas de replay e não expõe chaves. Encerrar Compasso não inclui autorização para encerrar a suíte Edi.
- `edi-motion`: modelo e avaliador das animações do EdiSVG.
- `edi-ocr`: OCR local com Tesseract. Root neutro (schema, limites, estados, geometria, plano de blocos), `/worker` e `/canvas` no renderer, `/search`, `/sensitive` e `/assets` (Node, no build: copia worker, núcleos, modelos e licenças para o app). Modelos e licenças ficam em `packages/edi-ocr/resources`. Ver [`packages/edi-ocr/README.md`](../packages/edi-ocr/README.md).
- `edi-native`: fontes C# comuns dos helpers Win32 (`csharp/`) e o build Node (`/build`, `/sources`) que compila o helper de cada app com o `csc` do .NET Framework. Não roda no Electron; o app usa o executável de `resources/native`. Ver [`packages/edi-native/README.md`](../packages/edi-native/README.md).

Um package `edi-*` só nasce quando dois apps usam o código ou na extração que migra o primeiro consumidor (regra da [base comum](./propostas/edi-suite-2026-10-16/edicaptura-lotes/base-comum.md)).

---

## Inter-package dependencies

Declaradas em `package.json` com `"workspace:*"`. Exemplos típicos:

- `auth` → `db`, `emails`. Expõe `AuditEventType`/`logAuditEvent`, mas os apps continuam donos do wiring e da observabilidade.
- `billing` → `db`, `auth`, `emails`, `config`. Observabilidade entra por `logger`/`onAudit` injetados pelo app. O package emite `billing.*`, mas quem persiste em `audit.events` é o app.
- `emails` → `db`. Audit é opcional via `onAudit`; o package emite `email.*` sem acoplar runtime ao `auth`.
- `ui` → (sem deps internas).
- `edi-ocr` → (sem deps internas). Externas fixas: `tesseract.js` e `tesseract.js-core` 7.0.0, `zod`.
- `edi-native` → (sem deps internas nem externas de runtime). Entra como `devDependency` do build do EdiAula e do EdiCaptura.
- `ai-core` → `db` (para `agent_runs` e `usage_logs` em `schema/ai`), `billing` (para o ciclo reserve/commit/release de créditos), Mastra (`@mastra/*`, incluindo observability) e AI SDK providers (`@ai-sdk/*`). Telemetria própria permanece provider-neutral; exportar para APM externo é responsabilidade do app.

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
- Payload de audit com PII/secrets fora da política em [`audit-payload-policy.md`](./audit-payload-policy.md).

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


Delegações de leitura usam `captureProfileReadDelegations` e `delegatedProfileReadCondition` (`family/delegation`), com schema próprio em `delegation-contract`. O contrato é separado de read/write para não exigir escrita a um consumidor de calendário. Token/prazo/revogação do consumidor continuam obrigatórios; ID da concessão e geração da ativação impedem ressurreição após regrant/restore. A preparação desse contrato para Agenda está no registro da migração; não indica que o feed antigo já foi convertido.
