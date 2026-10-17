# Arquitetura de cada app Next.js

Como um app dentro de `apps/<app>/` se organiza por dentro. Para o monorepo como um todo (workspaces, scripts, deploy), ver [`arquitetura-monorepo.md`](./arquitetura-monorepo.md). Para os packages que ele consome, ver [`arquitetura-packages.md`](./arquitetura-packages.md).

Este documento se aplica aos apps web Next.js. Ferramentas Electron seguem [`arquitetura-desktop.md`](./arquitetura-desktop.md).

---

## O que é um app

Um app é um **monolito Next.js 15+ App Router** que sobe individualmente em produção. É consumidor de packages internos (`@<org>/db`, `@<org>/ui`, `@<org>/auth`, ...) e dono de toda regra de negócio específica do produto que entrega.

Cada app tem seu domínio público, seu conjunto de variáveis de ambiente, seu pipeline de build e sua porta local. Apps **não** se importam mutuamente — se duas precisam compartilhar lógica, a lógica vira package.

O contato público e os links de suporte dentro das contas vêm de `@informach/config/contact` (`INFORMACH_CONTACT`). O canal aprovado é o direct do Instagram; páginas públicas não exibem endereço de e-mail para contato. Isso não altera o uso do e-mail do usuário no cadastro, na conta ou na autenticação.

---

## Layout interno

```
apps/<app>/
├── next.config.ts
├── package.json
├── tsconfig.json
├── .env.example
└── src/
    ├── app/                     # rotas e composição APENAS
    │   ├── (marketing)/
    │   ├── (app)/
    │   │   ├── layout.tsx
    │   │   ├── dashboard/page.tsx
    │   │   └── ...
    │   ├── (auth)/
    │   │   ├── login/page.tsx
    │   │   └── signup/page.tsx
    │   ├── api/
    │   │   ├── webhooks/<provider>/route.ts
    │   │   └── health/route.ts
    │   ├── layout.tsx
    │   ├── page.tsx
    │   ├── error.tsx
    │   ├── loading.tsx
    │   ├── global-error.tsx
    │   ├── not-found.tsx
    │   └── globals.css
    ├── features/                # fatias verticais (feature-based)
    │   └── <feature>/
    │       ├── components/
    │       ├── actions.ts
    │       ├── service.ts
    │       ├── repository.ts
    │       ├── schemas.ts
    │       ├── types.ts
    │       └── __tests__/
    ├── components/              # áreas pré-auth puramente visuais (marketing, legal)
    │   └── <area>/              # ex.: marketing/site-header.tsx, marketing/sections/hero.tsx
    ├── lib/                     # cross-cutting do app (não compartilhado)
    │   ├── action.ts            # wrapper de Server Action
    │   ├── env.ts               # t3-env do app
    │   ├── logger.ts            # pino instanciado para o app
    │   ├── observability.ts     # adapters app-level para Sentry + packages
    │   └── ...
    └── ai/                      # agentes/workflows IA específicos do app
        └── README.md
```

`app/` é deliberadamente fino. Uma `page.tsx` importa um componente da feature e uma action, e compõe — não tem regra de negócio nem data fetching cru.

---

## Vertical slicing por feature

A pasta `features/` é organizada por **fatia de domínio**, não por tipo de arquivo. Tudo de "convidar membro" mora em `features/members/` (componentes, action, service, repository, schemas, testes). Não em `components/InviteForm.tsx` + `actions/inviteMember.ts` + `services/membersService.ts` espalhados.

Por quê: uma mudança shippable (UI + DB + teste) sai num PR que toca uma pasta. Diff focado. Renomear/mover/excluir uma feature é uma operação. Layout flat (`components/` + `lib/` + `hooks/` + `services/`) parece organizado no início e apodrece em volume.

**Exceção: áreas puramente visuais.** Marketing, landing, páginas legais e similares não têm action/service/repository — só JSX e tokens. Para esses, `src/components/<area>/` (sibling de `features/`) é o lar correto. Exemplo concreto: a landing pública de `cozya` mora em `apps/cozya/src/app/(marketing)/page.tsx` e compõe componentes de `apps/cozya/src/components/marketing/` (header, footer, hero, seções). Quando uma página marketing começar a precisar de Server Action ou data fetching além de pura composição, ela vira feature de verdade — promova para `features/<area>/`.

---

## Camadas dentro de uma feature

Quatro camadas, regras de import impostas via Biome `noRestrictedImports`:

| Camada | Vive em | Pode importar | NÃO pode importar |
|---|---|---|---|
| **UI** | `components/*.tsx`, `app/**/page.tsx` | `actions.ts`, `schemas.ts`, `@<org>/ui` | repository, driver de DB |
| **Action** | `actions.ts` | `service.ts`, `schemas.ts`, `lib/action`, `next/*` | repository diretamente |
| **Service** | `service.ts` | `repository.ts`, outros services, `@<org>/result`, `lib/logger` | `next/headers`, `next/cache`, `auth()`, React |
| **Repository** | `repository.ts` | `@<org>/db` | services, Next.js, regra de negócio |

**Regra crítica**: o service é Next-free. Roda em Vitest puro, sem mock de `next/*`. É a alavanca de testabilidade unitária. Quando alguém precisar de `cookies()` no service, é cheiro de design — passe o que ele precisa como parâmetro a partir da action.

---

## Server Actions como entrada de mutation

Toda mutação passa por uma Server Action. Toda Server Action passa por um wrapper centralizado em `lib/action.ts` que faz, em ordem:

1. Parse Zod do input.
2. Resolve auth (`getCurrentUser`, membership, role).
3. Aplica rate-limit.
4. Audit log quando o evento/payload já é conhecido antes do handler.
5. Chama o service.
6. Captura no Sentry se o service retornar erro de infra.

No wrapper compartilhado de auth, `.rateLimit({ key })` usa escopo automático: usuário autenticado vira `key:user:<id>` e fluxo pré-auth vira `key:ip:<client-ip>`. Só use escopo global quando a intenção for limitar todos os usuários juntos.

Use `.audit(...)` para mutações simples cujo payload mínimo já existe antes do service rodar. Integrações que só ganham IDs transacionais depois do provider/package responder, como billing checkout/subscription, devem emitir via `config.onAudit` do package com `actorId` e payload real. PII segue [`audit-payload-policy.md`](./audit-payload-policy.md).

Esquema:

```ts
"use server";
export const inviteMemberAction = action
  .input(inviteSchema)
  .auth({ require: "member-of-org" })
  .rateLimit({ key: "invite", max: 10, window: "1m" })
  .audit("org.invitation_sent")
  .run(async ({ input, ctx }) => {
    const r = await inviteMember(input, ctx.actor);
    if (!r.ok) return { error: serializeError(r.error) };
    revalidatePath(`/org/${input.organizationId}/members`);
    return { ok: true };
  });
```

Erros específicos sobem do service como tipos; nunca `catch (e)` cego dentro da action.

---

## Result type no service

Service retorna `Result<T, E>`:

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

`throw` é reservado para falhas de infra realmente excepcionais (DB caiu, fila inacessível). Erros de domínio (`AlreadyMemberError`, `ForbiddenError`, `QuotaExceededError`) viram instâncias de classes nomeadas e voltam dentro de `Result`.

Por quê: torna o tratamento explícito no chamador (action), elimina retry genérico (cada erro decide sua estratégia), e mata a anti-prática de usar exceções para controle de fluxo.

---

## RSC por padrão, `"use client"` só em folhas

Toda rota e todo layout começam como Server Component. `"use client"` aparece só em componentes-folha que precisam de estado, efeito ou listener (formulário com validação progressiva, dropdown, modal). Compor server components com client components funciona desde que o client component receba props serializáveis.

Suspense via `loading.tsx` por rota. Streaming acontece de graça. PPR (Partial Prerendering) liga em rotas marketing-like quando estiver estável.

`useEffect` para data fetching é proibido (regra Biome). Use RSC ou TanStack Query.

---

## Forms

`react-hook-form` + `@hookform/resolvers/zod`. O **mesmo schema Zod** é importado pelo form e pela Server Action — uma fonte de verdade. Em caso de erro server-side (validação que depende de DB, ex: email já cadastrado), action retorna `error` tipado e o form mapeia para `setError(...)`.

---

## Estado

Hierarquia, do mais específico ao mais genérico:

1. **Server state em RSC**: fetch direto de service. Sem React Query em Server Component.
2. **Server state em Client Component**: TanStack Query, só onde o componente tem ciclo próprio (infinite scroll, polling).
3. **URL state**: `nuqs`. Filtros, abas, paginação — tudo que faz sentido ser back-button-safe e compartilhável.
4. **Estado global de UI**: Zustand, só quando estado realmente atravessa árvores.
5. **Context React**: theme, locale. Nada além disso.

Redux proibido. `useEffect` para fetch proibido. Estado em `useState` só quando 100% local ao componente.

---

## Estilo

Tailwind v4. CSS escrito à mão fica restrito a `globals.css`. Design tokens (cores, fontes, espaçamento) vêm de `@<org>/ui` via `@theme`. Componentes shadcn moram em `@<org>/ui` e são consumidos como `import { Button } from "@<org>/ui/components/button"`.

`globals.css` típico do app:

```css
@import "tailwindcss";
@import "@<org>/ui/styles.css";

@source "../../../packages/ui/src/**/*.{ts,tsx}";
```

A linha `@source` é o que faz o Tailwind escanear arquivos do package compartilhado. Sem ela, classes usadas só dentro do package são purgadas. Confirmado via Context7 como sintaxe atual do v4.

---

## Auth e dados sempre via packages

Regra dura: o app **não** instancia driver de DB, **não** chama Stripe direto, **não** monta cliente de auth do zero. Tudo isso passa por package — o app só consome a interface estável (`getCurrentUser`, `requireUser`, `db.query.users.findFirst`, `createCheckout`).

Benefício: trocar provider de billing, ORM ou auth vira um problema do package, não dos apps. Os apps continuam compilando.

---

## Pasta `src/ai/`

Cada app tem sua pasta `ai/` para agentes, workflows e lógica IA específica daquele produto. A primitiva compartilhada vem de `@<org>/ai-core`: tipos (`AppName`, `TokenUsage`, `ToolContext`), billing (`withCredits`), execução (`runBillableAiCall`, `runRecordedAiCall`), telemetria (`createAgentRunRecorder`), factories Mastra (`@<org>/ai-core/mastra`, incluindo `createDefaultObservability`), providers AI SDK (`@<org>/ai-core/providers`) e logger (`@<org>/ai-core/logger`).

Os agentes em si — prompts, tools, workflows e regras de produto — são código do app, não do package, porque são acoplados ao domínio do produto. O package só padroniza a fundação.

Contrato para qualquer rota/action que invoque LLM:

- Código em `src/ai/` começa com `import "server-only"` e roda em Node, nunca Edge.
- `DATABASE_URL`, `OPENROUTER_API_KEY` (gateway preferido — `createOpenRouter`), metadados OpenRouter (`OPENROUTER_HTTP_REFERER`, `OPENROUTER_X_TITLE`) e `MASTRA_LOG_LEVEL` são lidos no `lib/env.ts` do app e injetados nas factories. Apps que ainda chamam OpenAI/Anthropic direto declaram `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` adicionais. `@<org>/ai-core` não lê `process.env`.
- Toda chamada paga usa `withCredits`; o `reservation.id` vira o `runId` passado para `agent.generate({ runId })` e para `recorder.start/finish`.
- Usage vindo do provider é normalizado para `TokenUsage` antes de persistir ou calcular créditos. Se o provider retornar `inputTokens`/`outputTokens`, o app mapeia para `promptTokens`/`completionTokens`.
- `recorder.finish` só recebe status terminal: `succeeded`, `failed` ou `canceled`.

`ai/README.md` inicial documenta o contrato esperado do app específico: nomes de agentes, features cobradas, modelos permitidos, pricing por 1k tokens e quais tools podem acessar dados sensíveis.

---

## Validação e env

Zod em toda fronteira:

- Input de Server Action.
- Payload de webhook (`api/webhooks/.../route.ts`) antes de qualquer side effect.
- Resposta de API externa.
- Variáveis de ambiente.

`lib/env.ts` usa `t3-env` para split server/client e parse de `process.env` na build. Falta uma var → build falha com mensagem clara.

---

## Observabilidade

- **Logger**: `pino`, instanciado em `lib/logger.ts`. Estruturado (JSON em produção). Nunca `console.log`.
- **Sentry SDK Next.js**: configurado em `instrumentation-client.ts`, `sentry.server.config.ts` e `sentry.edge.config.ts` com `enabled` baseado em DSN, `enableLogs` ligado quando Sentry está ativo e `tracesSampleRate` explícito (1.0 em dev, 0.1 em produção).
- **Adapter app-level**: `lib/observability.ts` é o único lugar onde os packages encostam em Sentry. Exporta `packageLogger` para `@informach/billing`/`@informach/emails` (mantém pino e duplica `warn`/`error` sanitizados para `Sentry.captureMessage`) e `authObservability` para `@informach/auth` (breadcrumbs de audit, `onAuditPersistenceFailure` e security events). Contextos enviados ao Sentry passam por sanitização de chaves sensíveis.
- **Errors**: Sentry SDK Next.js. Captura em `error.tsx`, `global-error.tsx` e dentro do wrapper `lib/action.ts` quando o service retorna erro de infra.
- **Source maps**: subidos para Sentry no CI.
- **Health endpoint**: `app/api/health/route.ts` retornando 200 com timestamp + commit SHA. Não toca o banco, e é isso que o torna útil — ele responde qual commit está servindo mesmo quando o deploy vai mal.
- **Ready endpoint**: `app/api/ready/route.ts` é o que o provider usa como healthcheck. Chama `checkSchemaReadiness()` de `@informach/db` e responde 503 enquanto o banco estiver atrás da última migração deste build, para que uma instância publicada antes do migrator não receba tráfego. A comparação é "atrás", nunca "diferente": rollback do app sem desfazer migração continua passando.
- **Edge runtime**: não. Tudo Node. Pino e drivers de DB queremos em Node, e Railway é Node.

O Edi usa o mesmo SDK, com política mais restrita nesta etapa: captura apenas erros do servidor e check-ins do cron. `lib/observability.ts` centraliza falhas operacionais e `lib/telemetry.ts` reconstrói os eventos com campos permitidos, sem mensagens livres ou contexto de requisição. Logs Sentry, traces e captura no browser ficam desativados. A configuração e os limites estão no [guia de operação do Edi](../apps/edi/PRODUCAO.md#observabilidade-e-cron).

---

## Testes

Não-negociáveis. CI quebra PR em queda de cobertura.

| Tipo | Ferramenta | Alvo | Como roda |
|---|---|---|---|
| Unit | Vitest | services e funções puras | mock da interface do repository, não do driver de DB. ≥85% nos `service.ts`. |
| Integration | Vitest + testcontainers | repository → service → action | Postgres real subido pelo testcontainers, cada teste em transação com rollback. |
| E2E | Playwright | smoke dos fluxos críticos | contra o `webServer` do app com DB migrado/seedado. Stripe em test mode. Login → ação principal → resultado. |

Pipeline de CI: `lint → typecheck → unit → db:migrate → e2e → build`. Testes de integração/coverage entram como gates quando a suíte do app/package existir.

Apps que wireiam packages compartilhados devem ter testes pequenos de contrato para provar que `createAuth({ observability })`, `createBillingService({ onAudit })` e `createEmailService({ onAudit })` continuam conectados. `agenda-da-turma` e `cozya` já têm esse teste; `admin` só deve ganhar um quando virar app real.

---

## Deploy individual

`next.config.ts`:

```ts
import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@<org>/ui", "@<org>/auth", "@<org>/billing", "@<org>/db", "@<org>/emails", "@<org>/ai-core", "@<org>/config"],
  typedRoutes: true,
};

export default nextConfig;
```

- `output: "standalone"`: gera bundle slim para container.
- `outputFileTracingRoot`: aponta para a raiz do monorepo, **essencial** para o tracing achar arquivos de packages locais. Sem isso, o build standalone pode quebrar em runtime.
- `transpilePackages`: lista os packages internos consumidos com TS cru (que é como consumimos — sem `dist/`).
- `typedRoutes`: type-safety nos `<Link href="...">`.

Cada app sobe como service separado no provider, com root directory `/`, build/start commands específicos. Detalhes de Railway: ver [`arquitetura-monorepo.md`](./arquitetura-monorepo.md).

---

## Anti-patterns

- `next/headers` ou `cookies()` no service. Quebra unit test e acopla camada errada.
- Driver de DB (`drizzle`, `postgres-js`) importado direto em `app/page.tsx` ou em componente. Vai pelo package.
- Regra de negócio em `app/page.tsx`. Página compõe, não decide.
- `useEffect(() => fetch(...))`. Use RSC ou React Query.
- `as any` em retorno de Server Action.
- `try/catch` cego em volta de chamada de service. Cada erro tem tipo; trate explícito.
- Mutation feita via Route Handler quando Server Action serve. Route Handler para webhook, health, e API exposta a terceiros — não para o próprio app.
- Zod schema duplicado entre form e action. Compartilhe.
- Ler env diretamente via `process.env.X` no service. Vai por `lib/env.ts`.

---

## Quando criar uma feature nova

Sinal: nova surface area do produto que tem UI + dados próprios. Cria pasta nova em `features/`, replica o esqueleto (`components/`, `actions.ts`, `service.ts`, `repository.ts`, `schemas.ts`, `types.ts`, `__tests__/`).

Quando NÃO criar: um botão a mais numa feature existente. Adiciona dentro da feature dona.

Quando promover lógica para package: dois apps precisam dela. Aí migra para `packages/<pkg>` seguindo as convenções de [`arquitetura-packages.md`](./arquitetura-packages.md).

---

## Referências

- [`arquitetura-monorepo.md`](./arquitetura-monorepo.md) — o monorepo como um todo (workspaces, deploy, CI).
- [`arquitetura-packages.md`](./arquitetura-packages.md) — packages compartilhados que o app consome.
