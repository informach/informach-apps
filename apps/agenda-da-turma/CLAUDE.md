# `@informach/agenda-da-turma` — app guide

> Documentação primária do app para humanos e agentes. Para o root do monorepo ver [`/CLAUDE.md`](../../CLAUDE.md). Para os packages consumidos: [`@informach/auth/CLAUDE.md`](../../packages/auth/CLAUDE.md), [`@informach/billing/CLAUDE.md`](../../packages/billing/CLAUDE.md), [`@informach/emails/CLAUDE.md`](../../packages/emails/CLAUDE.md), [`@informach/ai-core/CLAUDE.md`](../../packages/ai-core/CLAUDE.md).

---

## 1. Propósito

Agenda da Turma organiza recados escolares em providências para a família: o que fazer, até quando e quem cuida. O titular continua sendo o subject de billing; o Pro permite um segundo adulto com login próprio e permissões por criança. Não usar o identificador do titular como identidade de autenticação do convidado.

Estado da implementação em 11/09/2026: rotina móvel, recado com texto + imagem/PDF, revisão antes de salvar, prazos opcionais e origem da data, convites revogáveis, atribuição de responsável, histórico/versionamento, resumo e lembretes, push opt-in, calendário privado, exportação e exclusão de conta. Nascimento, turma e matérias são opcionais no primeiro uso. Grupos de turma são privados por criador e turno; conhecer os dados públicos da sala não concede acesso.

O plano gratuito permite uma criança, 20 pendências próprias combinando escola/extras/recados, recebimento de atividades compartilhadas e cinco importações por conta verificada. Dados existentes continuam consultáveis após downgrade; novas automações pagas ficam pausadas. O Pro tem até três crianças, dois adultos e 70 créditos/mês. Não há validação de pagantes informada pelo fundador.

Teams e Batista ID são fontes de importação assistida (copiar publicação e enviar anexo). Conectores automáticos dependem de acesso autorizado e prova técnica; não estão disponíveis. Operação requer configuração de VAPID, envio de e-mail e scheduler. A implementação e a validação local não constituem implantação em produção.

Consulte [implementação e rastreabilidade](../../docs/reviews/agenda-da-turma-2026-09-11/IMPLEMENTACAO.md), [operação](../../docs/reviews/agenda-da-turma-2026-09-11/OPERACAO.md) e [piloto](../../docs/reviews/agenda-da-turma-2026-09-11/PILOTO.md).

---

## 2. Modelo econômico (alinhado com `@informach/billing`)

| Item | Valor |
|---|---|
| Pro mensal | **R$ 19,90/mês** (`agenda_da_turma_pro_monthly`) |
| Pro anual | **R$ 199,00/ano** (`agenda_da_turma_pro_annual`) — ~17% desc, 2 meses grátis |
| Créditos Pro | **70/mês**, drip mensal no anual, expiram no fim do ciclo |
| Free | 1 criança, 20 pendências próprias e 5 importações de teste por conta verificada |
| Gateway de IA | OpenRouter; revisão obrigatória dos resultados |

### Pacotes extras (Pro-only)

Mesma régua do cozya — pack custa mais per-credit que o plano (premium 20-40%) pra incentivar assinatura:

| Pack | Créditos | Preço | R$/crédito |
|---|---|---|---|
| `agenda_da_turma_credits_10` | 10 | R$ 6,90 | R$ 0,69 |
| `agenda_da_turma_credits_20` | 20 | R$ 12,90 | R$ 0,645 |
| `agenda_da_turma_credits_30` | 30 | R$ 17,90 | R$ 0,597 |

### Features de IA cadastradas

Recados têm captura própria com texto e anexo no mesmo processamento. As ferramentas anteriores de matérias e atividades continuam disponíveis no contexto de disciplinas. Pro tem 70 créditos/mês via webhook + sweeper; a captura de recados também aceita a franquia inicial gratuita.

| Feature | Modelo (OpenRouter) | Créditos |
|---|---|---|
| `agenda.notices.parse` | `openai/gpt-4o` | 1 |
| `agenda.subjects.parse_image` | `openai/gpt-4o` (imageDetail=low) | 1 |
| `agenda.subjects.transcribe_audio` | `openai/gpt-4o-transcribe` | 1 |
| `agenda.subjects.parse_voice` | `openai/gpt-4o-mini` | 1 |
| `agenda.activities.parse_image` | `openai/gpt-4o` (imageDetail=high) | 1 |
| `agenda.activities.transcribe_audio` | `openai/gpt-4o-transcribe` | 1 |
| `agenda.activities.parse_voice` | `openai/gpt-4o-mini` | 1 |
| `agenda.activities.parse_pdf` | `openai/gpt-4o` (multimodal file input) | 1 |

Cadastro em lote de atividades por voz/imagem/PDF espelha o pattern de
matérias: áudio → transcribe (1 crédito) → parse (1 crédito) → batch confirm
dialog; imagem → parse vision (1 crédito) → batch confirm dialog; PDF →
parse multimodal (1 crédito) → batch confirm dialog. Cada chamada cobra
1 crédito via reserve→commit/release, mesma régua das matérias. O parser
recebe a lista de nomes dos perfis de estudante do user no user-message
(server-side via `findStudentProfilesByUser`) e devolve `studentNameHint`
por atividade; o serviço resolve `studentNameHint` → `activeTurmaId` via
`findClosestStudent` (Levenshtein ≤ 3 + normalização) antes de devolver
pra UI, então o dialog pré-seleciona a turma do card quando a IA aponta
um filho específico. Somente ditado atual recebe a data de hoje como contexto.
Imagens e PDFs recebem aviso de data desconhecida; prazos relativos exigem
referência de publicação inequívoca. Nunca preencher amanhã/próxima aula por
ausência de prazo. A captura de recados não envia nomes dos perfis à IA e
exige escolha da criança pela pessoa na revisão.

PDF é processado direto pelo gpt-4o via AI SDK v6 (`type: "file"` +
`mediaType: "application/pdf"`) — sem conversão pra imagem no servidor.
Limites enforced antes da IA: máx 5 MB e 3 páginas (validação via
`pdf-lib` em `features/ai/pdf-utils.ts`); PDFs maiores retornam
`PDF_TOO_LONG`/`PDF_TOO_LARGE` no route handler antes de gastar crédito.

Fluxo de voz custa 2 créditos (transcribe + parse). Fluxo de imagem e
fluxo de PDF custam 1 crédito cada.

Seed em `packages/billing/src/seeds/credit-pricing.ts` (`AGENDA_PRICING_SEED` + `seedAgendaCreditPricing`) idempotente. Rodar `pnpm db:seed` insere rows em `billing.credit_pricing`.

Para adicionar nova feature de IA:
1. Adicionar row em `AGENDA_PRICING_SEED` com ID de modelo prefixado (`openai/gpt-4o-mini` por default).
2. Adicionar entry em `AGENDA_MODELS` (`apps/agenda-da-turma/src/ai/models.ts`).
3. Criar service em `src/features/ai/` envolvendo a chamada em `runBillableAiCall` (ou `withCredits` se multi-stage).
4. Adicionar route handler em `src/app/api/ai/...` com `withAiRouteGuards` (cobre OpenRouter key + auth + rate-limit + Pro gate).
5. Garantir que rate-limit em `lib/rate-limit.ts` cobre — hoje `AI_INVOKE_PER_HOUR: 60` cobre todas as features de IA da Agenda.
6. UI: botões com `disabled={!isPro}` + `Badge` "Pro" (mesmo padrão do `ExportPdfButton`).

---

## 3. Estrutura

```
apps/agenda-da-turma/
├── src/
│   ├── app/                       # Next 16 app router
│   │   ├── (auth)/                # /login, /signup, /choose-plan (passo 3 onboarding)
│   │   ├── (app)/                 # autenticadas
│   │   │   ├── dashboard/         # KPIs + buckets (atrasadas/hoje/7 dias) + per-profile progress
│   │   │   ├── atividades/        # CRUD completo + paginação keyset
│   │   │   ├── calendario/        # vistas mês/semana/dia + modal de detalhe
│   │   │   ├── settings/billing/  # plano + saldo + packs (Pro) + history + portal
│   │   │   └── upgrade/           # PlanCards sem stepper, só Pro (Free → Pro)
│   │   ├── api/                   # webhooks/jobs (auth, billing, emails)
│   │   │   ├── auth/[...all]/     # Better Auth handler
│   │   │   ├── webhooks/{stripe,sendgrid}/
│   │   │   ├── jobs/              # 5 billing crons + 3 email crons
│   │   │   ├── email/unsubscribe/
│   │   │   └── health/
│   │   ├── playground/            # smoke test de tokens UI (mantido enquanto não há features reais)
│   │   ├── page.tsx               # placeholder de landing (texto simples, sem CTA)
│   │   └── layout.tsx             # Plus Jakarta Sans + ThemeProvider + Toaster
│   ├── features/
│   │   ├── activities/            # CRUD + batch confirm dialog de IA + voice/image dialogs + match-{subject,student} (fuzzy resolver) + utils
│   │   ├── ai/                    # helpers cross-feature: _http-errors, image-utils (downscaleToDataUrl), _shared (withAiRouteGuards), services dos parsers
│   │   ├── billing/               # plan-cards, plan-card, credit-balance-card, credit-packs, history (paridade cozya)
│   │   ├── calendar/              # /calendario: views mês/semana/dia, blips, day-cell, detail-dialog, helpers de range/grid
│   │   ├── dashboard/             # KPIs, buckets, per-profile summaries, helpers de data com TZ São Paulo
│   │   ├── onboarding/            # signup-form (3 passos), login-form, plan-cards usado em /choose-plan + /upgrade
│   │   ├── students/              # perfis de estudante (CRUD, dialogs, avatar com chart-N, widgets do dashboard)
│   │   ├── subjects/              # matérias por turma + paleta chart-N collision-free
│   │   └── turmas/                # turmas (create/join-by-code/active/leave + comboboxes IBGE+INEP)
│   ├── components/
│   │   ├── brand/agenda-logo.tsx  # logotipo SVG inline (theme-aware)
│   │   ├── app-shell/             # AppHeader + UserMenu (avatar com Meus perfis / Minhas turmas / billing / sair)
│   │   └── site-header.tsx        # header /login + /signup (logo + ModeToggle); evolui pra dashboard depois
│   ├── lib/
│   │   ├── env.ts                 # Zod-validated envs
│   │   ├── auth.ts                # createAuth({ email: { verification: "otp", signIn: { magicLink: false }, forgetPassword: "otp" } })
│   │   ├── billing.ts             # createBillingService({ organizationsEnabled: false, app: APPS.agendaDaTurma.slug })
│   │   ├── emails.ts              # createEmailService(...)
│   │   ├── action.ts              # createActionFactory({ helpers, rateLimitStorage: redisRateLimitStorage(redis, "agenda-da-turma:rl:") })
│   │   ├── action-result.ts       # catchActionResult / isActionRejected (client helper)
│   │   ├── observability.ts       # packageLogger + Sentry
│   │   ├── redis.ts               # ioredis com ?family=0 implicit (Railway IPv6)
│   │   ├── sendgrid-webhook.ts    # signature verify helper
│   │   └── logger.ts              # pino app-level
│   ├── proxy.ts                   # auth proxy; requireAuth: ["/dashboard","/choose-plan","/upgrade","/settings","/perfis","/turmas","/api/data"]
│   ├── instrumentation.ts         # Sentry init (server)
│   └── instrumentation-client.ts  # Sentry init (client)
├── e2e/                           # Playwright (auth signup/signin por senha/OTP)
├── public/
│   └── logotipo.svg               # asset original (versão inline em components/brand/)
└── next.config.ts                 # Sentry + standalone output + security headers/CSP estática
```

### Auth (OTP-only)

- **Verificação de email**: OTP 6 dígitos (não link).
- **Sign-in**: email/senha (sem magic link).
- **Forget password**: OTP (não link).

Justificativa em `packages/auth/CLAUDE.md` §3.1: OTP mantém usuário na mesma página, ótimo para mobile-first. Mesma decisão do cozya.

Notificação `auth.signup-attempt-on-existing` está wired e dispara para **todos** os usuários existentes (não só Pro). O gate Pro foi removido em 2026-05-14 porque criava vazamento de info: atacante deduzia que "email existente recebe notificação ⇒ é Pro" via signup attempt. Defesa anti-spam fica no rate limit do `/sign-up/email` (5/h) — qualquer escalada futura (CAPTCHA, IP throttle) deve manter a notificação democrática.

### Billing

- `subject.type = "user"` sempre (`organizationsEnabled: false`).
- `app: APPS.agendaDaTurma.slug` ("agenda-da-turma") garante isolamento de customers/credits do cozya — UNIQUE `(provider, subject_type, subject_id, app)` em `billing.customers`.
- `hasProSubscription` é o gate único para liberar packs de crédito + (futuramente) features de IA.
- LGPD: `accountDeletion.onBeforeDelete` chama `billing.cancelBillingForSubject` (cancela assinaturas; saldos e linhas históricas ficam por retenção fiscal).
- Webhook handlers transacionais (`billing.payment-success` / `subscription-renewed` / `subscription-canceled` / `credits-purchased`) e dunning (`billing.payment-failed` via cron) usam `appName: APPS.agendaDaTurma.name` ("Agenda da Turma") nos templates.

### Onboarding em 3 passos

1. **Cadastro** — name + email + password → `/signup`.
2. **Verificação** — OTP 6 dígitos → reenviar com cooldown de 60s.
3. **Plano** — `/choose-plan`, free vs Pro mensal/anual; Free vai pra `/dashboard?welcome=...`, Pro abre Stripe Checkout.

Stepper (`features/onboarding/components/onboarding-stepper.tsx`) usa `currentStep: 1 | 2 | 3`. Após OTP verify, `signup-form.tsx` redireciona pra `/choose-plan` por default (override possível via prop `verifiedRedirectTo`).

---

## 4. Stripe Dashboard — checklist operacional

Estrutura no Stripe espelha o cozya (`apps/cozya/CLAUDE.md` §5): **2 Products + 5 Prices**, não 5 Products. Catálogo live (criado em 2026-05-14):

- **Product 1 — `Agenda da Turma Pro`** (`prod_UVx1FUGEPYM2bz`, subscription)
  - Price Monthly: R$ 19,90/mês → `agenda_da_turma_pro_monthly` → `price_1TWv7xCvOctqao30IPggyGFa`
  - Price Annual: R$ 199,00/ano → `agenda_da_turma_pro_annual` → `price_1TWv81CvOctqao30XGmMOWZD`
- **Product 2 — `Agenda da Turma Créditos`** (`prod_UVx1G1I9SR4qgE`, one-time)
  - Price 10 créditos: R$ 6,90 → `agenda_da_turma_credits_10` → `price_1TWv84CvOctqao30QgIrNZ9n`
  - Price 20 créditos: R$ 12,90 → `agenda_da_turma_credits_20` → `price_1TWv8HCvOctqao30iOFfzANE`
  - Price 30 créditos: R$ 17,90 → `agenda_da_turma_credits_30` → `price_1TWv8nCvOctqao30K7FDTElg`

Com `NODE_ENV=production` e `STRIPE_MODE=prod`, `src/lib/billing.ts` falha no boot se qualquer produto da Agenda voltar a ter `price_TODO_*`. UI também esconde packs com placeholder via `isStripePriceIdConfigured` no slot do `/settings/billing`, e checkout do Pro retorna `PRO_NOT_CONFIGURED` no toast (`InvalidProductError` do package).

> Pré-deploy ainda pendente no Stripe Dashboard (não-bloqueante pro código, mas recomendado antes do go-live):
> - Anexar `tax_code: "txcd_10000000"` (General Services) nos 2 products.
> - Setar `nickname` em cada price (ex: "Agenda da Turma Pro — Mensal").
> - Adicionar `metadata.app=agenda-da-turma` e `metadata.product_id=<config-id>` nos 5 prices (facilita reconciliação manual; o billing package roteia por `priceId`, não por metadata).

Webhook endpoint + eventos de billing: ver `packages/billing/PRODUCTION.md` e `docs/deploy-runbook.md` Fase 10.

### Crons no Railway (não recriar)

A estratégia é **híbrida** (ver `docs/deploy-runbook.md` Fase 11): existem 7 cron services per-app + 2 globais no Railway, **independentes do número de apps**. Pra ativar os crons da Agenda da Turma após deploy:

1. Editar a env var `APP_DOMAINS` em cada um dos 7 cron-perapp services.
2. Adicionar `agenda-da-turma.informach.com.br` (space-separated):
   ```
   APP_DOMAINS=cozya.informach.com.br agenda-da-turma.informach.com.br
   ```
3. Os 2 cron-global services (`auth-cleanup`, `email-suppression-sync`) operam em schemas compartilhados (`core.users`, `core.email_suppressions`) — **nada a fazer**.

**Não criar cron services novos.** As rotas `/api/jobs/billing-*` e `/api/jobs/email-*` já existem no app — recebem o curl do loop `for d in $APP_DOMAINS; do curl https://$d/api/jobs/<endpoint>; done`.

---

## 5. Env vars

Validadas em `src/lib/env.ts` via Zod (`@t3-oss/env-nextjs`):

| Var | Required | Notas |
|---|---|---|
| `DATABASE_URL` | sim | Postgres compartilhado com auth/emails/billing |
| `BETTER_AUTH_SECRET` | sim | ≥32 chars (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | sim | URL pública (HTTPS em prod) |
| `NEXT_PUBLIC_APP_URL` | sim | mesmo valor de `BETTER_AUTH_URL` |
| `SENDGRID_API_KEY` | sim | escopo Mail Send + Suppressions |
| `SENDGRID_FROM` | sim | email verificado no domínio autenticado |
| `SENDGRID_WEBHOOK_PUBLIC_KEY` | opcional | só se webhook ativado |
| `EMAIL_SANDBOX_MODE` | default `live` | `live\|sandbox\|memory` |
| `EMAIL_SANDBOX_DIR` | default `./tmp/integration_emails` | só pra `mode=sandbox` |
| `CRON_SECRET` | sim | ≥32 chars; gate de `/api/jobs/*` |
| `STRIPE_SECRET_KEY` | sim | `sk_test_*\|sk_live_*\|rk_test_*\|rk_live_*` (restricted recomendado em prod) |
| `STRIPE_WEBHOOK_SECRET` | sim | `whsec_*`; placeholder na fase 5 do runbook |
| `STRIPE_PUBLISHABLE_KEY` | opcional | só se for usar Stripe Elements client-side |
| `STRIPE_MODE` | opcional | override; default infere de `NODE_ENV` |
| `REDIS_URL` | opcional dev / **obrigatório prod** | secondary storage do Better Auth + rate-limit do action factory (prefix `agenda-da-turma:rl:*`). Use `?family=0` no Railway (IPv6-only) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | opcional | habilita social login Google |
| `E2E_RELAX_AUTH_RATE_LIMITS` | opcional | `"1"` em CI Playwright; **proibido em prod** (guard pós-parse) |
| `LOG_LEVEL` | opcional | `debug\|info\|warn\|error` |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | opcional | wire-up Sentry |

**Build-time vars** (afetam output Next): toda var lida via `env.X` em código de boot/proxy precisa estar em `turbo.json` `tasks.build.env`. Ao adicionar nova var build-relevante, atualizar lá ou Turbo serve cache stale.

---

## 6. Perfis e Turmas (modelo de dados central)

### Perfis de Estudante (`agenda.student_profiles`)

Sub-entidades por conta, sem login próprio. Free = 1 perfil, Pro = 3. Limite enforced em `service.createStudentProfile` via `pg_advisory_xact_lock("agenda:student_profiles:<userId>")` + count check antes do insert. Coluna `active_turma_id uuid NULL FK -> agenda.turmas.id ON DELETE SET NULL` aponta pra turma ativa do perfil (no máximo uma).

Avatar: iniciais (até 2 letras) + cor derivada por hash do nome via paleta `chart-1..5` (mesma das matérias). Sem upload de foto no v1 — não há infra de blob storage no monorepo.

Card no `/perfis` mostra `"X anos · {Turma ativa | Sem turma vinculada}"`. Menu do card: **Gerenciar turmas** (`/turmas?perfil=<id>`) + Editar + Excluir.

### Turmas (`agenda.turmas` + `agenda.turma_members`)

**Turmas são compartilhadas entre contas** (modelo Netflix-household estendido) — diferente dos perfis. Várias famílias com filhos na mesma turma têm uma única row em `agenda.turmas`. UNIQUE em `(school_inep_code, grade, year, class_letter)` é a chave natural pra dedup.

Fluxos de cadastro:
1. **Manual** — usuário escolhe estado → cidade → escola → série → ano → letra. Service tenta `INSERT ... ON CONFLICT DO NOTHING`; se conflitou, faz SELECT pelo natural key e retorna `created: false`. Em ambos os casos: insere `turma_member` (idempotente), seta como ativa do perfil.
2. **Por código** — código de 6 chars (alfabeto sem ambíguos: sem `0/O/1/I/L`) gerado server-side, retry em colisão. UNIQUE em `agenda.turmas.code`. User entra com o código + escolhe perfil → vira membro + ativa.

Listagem: `listTurmasForUser` traz turmas onde **(a) o user é o criador (`created_by_user_id`) OU (b) algum dos perfis do user é membro**. LEFT JOIN em `turma_members` filtrado por perfis do user — turmas criadas mas sem nenhum perfil seu vinculado ainda aparecem com `members: []`, pra que o creator consiga ver/copiar o código pra compartilhar ou re-vincular. Página `/turmas` é única, filtrável via `?perfil=<id>` — o filtro restringe só a turmas onde aquele perfil é membro (turmas creator-only só aparecem em "Todos").

`TurmaCard` lida com `members.length === 0`: mostra "Nenhum estudante seu vinculado" + botões "Vincular [perfil]" pra cada perfil disponível (chama `joinTurmaByCodeAction` com o próprio code da turma — auth + rate-limit do helper já cobrem). Quando há membros mas perfis não-membros existem, aparece um dropdown discreto "Vincular" no header da seção Estudantes.

`active_turma_id` é mutuamente exclusivo: setar uma turma como ativa só faz UPDATE da coluna; o helper `setActiveTurma` em `service.ts` valida que o perfil é membro antes (`verifyMembership`). Sair da turma (`deleteTurmaMember`) limpa `active_turma_id` na mesma transação se for a turma ativa.

### Governança creator/membro em turmas compartilhadas

Como turmas são compartilhadas entre famílias, edição/exclusão precisa balancear autonomia do creator com proteção dos dados das outras famílias. As regras são:

| Ação | Quem pode | Bloqueado quando |
|---|---|---|
| Criar matéria | Qualquer membro da turma (creator ou perfil vinculado de outra família) | — |
| Editar `teacherName` da matéria | Só quem criou a matéria | — (sempre livre) |
| Editar `name` da matéria | Só quem criou a matéria | "Em uso por outras famílias" + mudança não é "pequeno ajuste" (regra abaixo) |
| Excluir matéria | Só quem criou a matéria | "Em uso por outras famílias" (qualquer atividade alheia) |
| Apagar turma | Só o creator (`turmas.created_by_user_id`) | Outra família tem perfil vinculado (`hasOtherFamilyMembersInTurma`) OU turma tem qualquer atividade cadastrada (`turmaHasActivities`) |
| Editar turma | Só o creator (`turmas.created_by_user_id`) | Mesma regra de apagar — outra família vinculada OU qualquer atividade cadastrada. Edita `grade`, `year`, `classLetter` (escola não editável). Retorna `CONFLICT_EXISTING_TURMA` se as novas coordenadas colidirem com o UNIQUE `(school+grade+year+letter)` |

**Regra "em uso por outras famílias"** (matérias): qualquer atividade — individual OU compartilhada com a turma — criada por outro usuário e vinculada à matéria conta como uso. Mensagem genérica ("essa matéria está sendo usada por outras famílias") preserva privacidade: não vaza quem nem quantos. **Atividades do próprio criador da matéria NÃO contam** (`created_by_user_id != currentUserId`).

**Regra "pequeno ajuste no nome"** (`isMinorNameEdit` em `features/subjects/utils.ts`): quando o nome está em uso por outras famílias, edição do nome só é permitida se for:
1. **Normalize-equal** — depois de tirar acento/caixa/pontuação/espaços extras, os nomes coincidem (ex: "matematica" → "Matemática", "Ed. Física" → "Ed Física").
2. **Distância de edição ≤ 3** (Levenshtein) sobre os nomes normalizados — cobre erro de digitação típico ("Matemtica" → "Matemática", "Geogarfia" → "Geografia").

Mudanças maiores (ex: "Matemática" → "Educação Física") retornam `NAME_CHANGE_TOO_BIG`. Mensagem na UI: "Outras famílias já usam essa matéria. Só ajustes pequenos no nome são permitidos (acento, caixa, erro de digitação)." Quem quiser nome radicalmente diferente: criar matéria nova. **`teacherName` continua livre sempre** — professor não muda o teor da matéria.

**Implementação**: o helper `isSubjectInUseByOtherUsers(subjectId, currentUserId)` em `features/subjects/repository.ts` consulta `agenda.activities` com `subject_id = $1 AND created_by_user_id != $2`. O service invoca esse helper em `updateSubject`/`deleteSubject` e retorna `IN_USE_BY_OTHERS` quando outra família usa a matéria.

**Por que "apagar turma" não tem transferência automática de creator?** Decisão de produto: turmas que perdem o creator viram órfãs (ninguém deleta) mas seguem 100% funcionais — membros ainda criam/editam suas próprias matérias e atividades. Trade-off aceito: simplicidade > housekeeping. Membros que quiserem uma turma 100% sua podem sair desta e criar nova.

### Atividades

Schema (`packages/db/src/schema/agenda.ts`):

- **`agenda.activities`** — id, turmaId, subjectId, createdByUserId, type (task|exam|project|reminder), visibility (individual|shared_with_turma), title, description, **`dueAt` (DATE, "YYYY-MM-DD" sem hora/TZ)**, createdAt, updatedAt.
- **`agenda.activity_statuses`** — 1 row por (atividade × `studentProfileId`), status pending|done. Por-perfil, não por-atividade.
- **`agenda.activity_acceptances`** — quando outra família aceita uma shared activity (1 row por `(activityId, userId)`).

**RBAC de visibilidade (enforcement no service `features/activities/service.ts`)**:
- **Free**: criar sempre força `visibility = 'individual'`. Listagem filtra `created_by_user_id = currentUserId`. Atividades `shared_with_turma` de outros membros NUNCA aparecem.
- **Pro**: pode escolher `individual` ou `shared_with_turma` na criação. Listagem inclui suas próprias E `shared_with_turma` de outros membros da turma.
- Gate único: `hasProSubscription(subject)` do `@informach/billing/access`. Nunca inline `status === 'active'`.

**Edit/delete de atividade**: só o `created_by_user_id`. **E** bloqueia mesmo o criador se a atividade é shared_with_turma e `hasOtherAcceptances=true` (outra família já aceitou). Regra centralizada em `canEditActivity(item, currentUserId)` em `features/activities/utils.ts` — UI esconde, service aplica.

**Defaults do form** (`buildActivityFormDefaults` em `features/activities/utils.ts`): pura, testada — calcula `defaultValues` do RHF tanto em modo create quanto edit. Aceita `defaultDueAt` (usado pelo calendário ao clicar num dia vazio) e `defaultTurmaId` (auto-select se única turma). Em modo edit, ignora os defaults e usa os campos da `activity`.

**SELECT canônico** (`activityListSelect` + `hasOtherAcceptancesExpr` em `features/activities/repository.ts`): export compartilhado entre `/atividades` (paginação keyset), dashboard (buckets) e calendário (range BETWEEN). Garante que `ActivityCard`, `ActivityDetailDialog` e demais consumidores recebem o mesmo shape `ActivityListItem` sem adapters.

**Cascade quando matéria é apagada**: como a regra bloqueia delete da matéria enquanto há atividades de OUTRAS famílias, na prática o cascade só roda quando todas as atividades vinculadas são do próprio creator da matéria — perda consciente.

### Datas e timezone (`features/dashboard/date.ts`)

Toda data de calendário vive como **string "YYYY-MM-DD"** (formato da coluna `date` do Postgres em `agenda.activities.dueAt`). Comparação lexicográfica funciona corretamente nesse formato (ano-mês-dia padded).

**Regra de TZ**: `todayLocalIso()` usa `Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })` via `formatToParts` — independente do TZ do servidor (Railway roda UTC). Sem isso, uma tarefa cadastrada às 21h BRT "viraria" pro dia seguinte na visão do back-end UTC, e a vista de "hoje" no dashboard/calendário mostraria o dia errado por 3h por noite.

Helpers:
- `todayLocalIso(now?)` — São Paulo hoje (aceita Date pra testes).
- `addDaysIso(iso, days)` — **pure string math**, server-TZ-neutro. Use pra qualquer "hoje ± N": `addDaysIso(todayLocalIso(), 7)`.
- `toLocalIso`, `parseLocalIso`, `addDaysLocalIso` — server-TZ-neutros (operam sobre Dates sintéticos meio-dia local). **Não passe `new Date()` direto** pra eles — só use com Dates vindos de `parseLocalIso`. Pra "hoje + N" use sempre `addDaysIso(todayLocalIso(), N)`.

### Calendário (`/calendario`)

3 vistas (mês/semana/dia), URL como fonte da verdade (`?view=`, `?date=YYYY-MM-DD`, `?perfil=<id>`). Domingo é o primeiro dia da semana (default BR — Google Calendar/iOS).

- **Mês**: grid manual 7×6 com blips coloridos pela matéria (`chart-N/15` + `chart-N/40` borda) e sinais de status sobrepostos: borda esquerda destructive (atrasada), ring chart-4 (hoje/amanhã), opacidade+strike (concluída). Até 3 blips por dia, resto em Popover "+N mais". Clicar célula vazia → `ActivityFormDialog` com `defaultDueAt` pré-preenchido. Linhas clarinhas via `divide-x divide-y divide-border/60` no grid.
- **Semana**: 7 colunas (desktop) / linhas (mobile) com lista de blips por dia.
- **Dia**: lista vertical reusando `ActivityCard` em modo completo.

Data layer: `features/calendar/repository.ts` (`listActivitiesInDateRange(userId, { fromIso, toIso, profileFilter, isPro })`) reutiliza `activityListSelect`. Service `getCalendarSnapshot` checa Pro (`billing.hasProSubscription`) e calcula o range visível via `rangeForView` em `features/calendar/date.ts` (mês cobre os 42 dias visíveis, inclui spillover).

**Modal de detalhe** (`features/calendar/components/activity-detail-dialog.tsx`): dedicada (não reuso do `ActivityCard`). Hierarquia visual diferente (título grande, badges de tipo/urgência/perfil, descrição em prose). Edit/Delete abrem `ActivityFormDialog`/`DeleteActivityDialog` como sub-dialogs — Radix lida com aninhamento.

**Por que grid manual em vez do `<Calendar>` (react-day-picker) do `@informach/ui`**: RDP v9 renderiza `<button>` por dia, e aninhar blips clicáveis cria nested interactives (problema de a11y). Além disso RDP só faz mês — semana/dia já seriam custom de qualquer jeito.

### Reference data: estados, cidades, escolas

Schema: `agenda.states` (27 rows IBGE), `agenda.cities` (~5570 rows IBGE, FK pra states.uf), `agenda.schools` (~181k rows INEP, FK pra cities.ibge_code). Tabelas auxiliares pra alimentar comboboxes pesquisáveis no cadastro manual de turma.

**Seed via `pnpm db:seed:reference`** (em `packages/db/src/seeds/`):
1. `states.ts` — fetch IBGE `/api/v1/localidades/estados` + upsert (rápido).
2. `cities.ts` — pra cada estado, fetch `/api/v1/localidades/estados/{UF}/municipios` + upsert (~30s).
3. `schools.ts` — busca o CSV em duas localizações no root do repo, em ordem: (a) `escolas_inep.csv.gz` (~11MB, **rastreado em git** — Railway Migrator usa essa fonte) descomprimido em runtime via `zlib.createGunzip()`; (b) `escolas_inep.csv` (~74MB, gitignored, opção dev). Stream via `papaparse`, batch upsert de 1000 rows (~30s). Resolve `cityIbgeCode` por lookup `(UF, normalized name)` contra `agenda.cities` (já seedado). Sem nenhum dos dois o seed loga warning e segue (estados+cidades funcionam mesmo assim, mas combobox de escolas fica vazio).

**Em produção (Railway)**: `infrastructure/railway/migrator.toml` startCommand é `pnpm db:migrate && pnpm db:seed && pnpm db:seed:reference` — o migrator service redeploy popula tudo automaticamente. O `escolas_inep.csv.gz` está no repo e é parte do build do migrator.

**Caso especial documentado**: rows do INEP cujo nome é exatamente `"COLEGIO BATISTA MINEIRO"` (sem sufixo de unidade) são renomeadas no insert pra `"COLEGIO BATISTA MINEIRO - UNIDADE FLORESTA"` — desambiguação solicitada pela usuária. Outras variantes (`"...- UNIDADE BETIM"`, etc) passam intactas.

Endpoints `/api/data/{states,cities,schools}` (auth-gated via `proxy.ts`) servem essas tabelas pros comboboxes (`AsyncCombobox` com debounce 200ms + ILIKE+unaccent server-side).

### Dashboard widgets (mutuamente exclusivos)

Em `app/(app)/dashboard/page.tsx`:
- `count === 0` → `<NoStudentsWidget />` (azul/primary): "Comece organizando a rotina das crianças" + CTA pra `/perfis`.
- `count > 0 && profilesWithoutTurma > 0` → `<ProfilesWithoutTurmaWidget />` (warning/amber): "Vincule seu estudante a uma turma" + CTA pra `/turmas`.

UserMenu (avatar) tem links rápidos: **Meus perfis** (`/perfis`) e **Minhas turmas** (`/turmas`), separados das ações de billing/sair.

---

## 7. Design tokens (cores)

**Não inventar token novo — sempre reutilizar os existentes** (mesmo conjunto que cozya: `primary, secondary, destructive, ring, chart-1..5, sidebar-*`). Identidade visual do app vem de **trabalhar bem essas cores**, não de adicionar tokens próprios.

Tokens definidos em `src/app/globals.css` (light + dark):

| Token | Cor (light) | Uso semântico |
|---|---|---|
| `--primary` | Azul #006FFD | CTAs principais, links, logo, headers de feature |
| `--secondary` | Roxo #7C3AED | acentos secundários, banner upgrade |
| `--destructive` | Vermelho #EF4444 | ações destrutivas, "atrasada", erros |
| `--chart-1` | Azul #3B82F6 | **Matemática** + avatar + tom "informação" |
| `--chart-2` | Verde #10B981 | **Português** + avatar + tom "sucesso" (turma ativa) |
| `--chart-3` | Violeta #8B5CF6 | **Ciências** + avatar |
| `--chart-4` | Laranja #F97316 | **História** + avatar + tom "alerta/warning" (perfil sem turma) |
| `--chart-5` | Rosa #EC4899 | **Inglês** + avatar |

**Cores semânticas (sucesso/alerta/info) reaproveitam `chart-N`** — não criar tokens dedicados. Convenções:
- Sucesso/positivo → `chart-2` (verde) — ex: badge "Ativa", check, confirmações
- Alerta/atenção → `chart-4` (laranja) — ex: tarefa "Hoje" pendente, deadlines próximos
- Erro/atrasado → `destructive` — ex: badge "Atrasada", botões destrutivos
- Informação → `chart-1` (azul) ou `primary`
- Premium/elevado → combinar `secondary` + `chart-3` (ambos roxos) — ex: banner upgrade, widget de "vincule estudante a turma"

**Regras pros componentes:**
1. **Sempre token, nunca literal.** Proibido `bg-blue-500`, `text-emerald-600`, `#fff`, `oklch(...)` em código da agenda. Use sempre `bg-primary`, `text-chart-2`, etc.
2. **Combinar tokens pra variações ricas.** O design caprichado vem de **misturar** tokens próximos (ex: `from-primary/10 ... to-chart-1/10` no widget de onboarding; `from-secondary/10 ... to-chart-3/10` no widget de turma). Uma cor sozinha fica raso — paleta ganha vida quando tokens irmãos compõem gradients/borders/icons.
3. **Avatar de perfil** consome `chart-1..5` via hash do nome (`getAvatarColorClass` em `features/students/utils.ts`).
4. **Tinted badges/cards**: `bg-chart-N/15` + `border-chart-N/40` + texto `text-foreground` ou `text-chart-N`. Opacidade baixa no fundo dá tom suave que combina com o resto da UI.
5. **Matérias** herdam `chart-N` quando feature aparecer — Matemática=1, Português=2, Ciências=3, História=4, Inglês=5.

Neutros (`background, foreground, card, popover, muted, accent, border, input, sidebar`) vêm do `@informach/ui` e **não** se sobrescreve aqui — são compartilhados entre apps pra consistência cross-app.

---

## 8. Pendências vs cozya (gaps conhecidos)

Ordem rough de prioridade quando produto evoluir:

1. **Wiring Railway Dashboard** — `apps/agenda-da-turma/railway.toml` existe. Ainda precisa apontar o service no Railway para esse Config Path quando o deploy for plugado.
2. **Price IDs live** — substituir todos os `price_TODO_*` da Agenda em `packages/config/src/products.ts` antes de habilitar Pro/Pacotes em produção. O boot guard em `src/lib/billing.ts` trava se faltar algum.
3. **CSP** — nonce por request é encaminhado ao render e ao ThemeProvider; o layout lê headers e renderiza páginas dinamicamente. Validação no navegador local com `CSP_ENFORCE=1` sem violações de execução. Build otimizado aprovado; teste do runtime de produção ainda depende de homologação, pois a inicialização local desse build foi bloqueada pela aprovação automática. Não presumir que a variável publicada em Railway foi alterada por este trabalho. Manter `strict-dynamic`, sem relaxar `script-src` para contornar um nonce ausente.
4. **Rate limit anti-script** — `lib/rate-limit.ts` com Postgres-via-Redis ainda não existe. Replicar pattern do cozya quando feature de IA chegar (defesa em camadas além do cap mensal de créditos).
5. **IA pipeline** — descrito em §2 acima. Bloco grande: agentes Mastra + seed `creditPricing` + integração `withCredits`/`runBillableAiCall`.
6. **Site header pra dashboard** — `site-header.tsx` hoje é minimalista (só auth pages). Quando dashboard tiver navegação real, evoluir pro pattern variant igual `apps/cozya/src/components/marketing/site-header.tsx`.
7. **Landing pública** — `app/page.tsx` é placeholder. Decisão de produto: ter landing própria em `agenda-da-turma.informach.com.br/` ou redirect pra `informach.com.br/agenda-da-turma`?

---

## 9. PWA (escopo mínimo, sem service worker)

Agenda da Turma é instalável como PWA em iOS e Android sem rodar service worker. Todo o setup é declarativo via Next 16 metadata routes:

- `src/app/manifest.ts` — `display: standalone`, `theme_color: "#006FFD"` (azul `--primary` da agenda), ícones com `purpose: "any"` E `"maskable"` para os mesmos PNGs (Chrome aceita; Lighthouse PWA passa).
- `src/app/layout.tsx` — `viewport` (`themeColor` light+dark, `viewportFit: "cover"`) e `metadata.appleWebApp` (`capable: true`, `statusBarStyle: "black-translucent"`, `title: "Agenda da Turma"`).
- `src/app/{favicon.ico,icon.png,icon.svg,apple-icon.png}` — Next auto-linka.
- `public/web-app-manifest-{192,512}.png` — ícones referenciados pelo `manifest.ts`.

Sem cache de assets, sem offline, sem push notifications. A decisão é deliberada (mesma do cozya §8) — adicionar SW exige cuidados extras (invalidação após mutate, CSP `worker-src`, conflito com cookies do Better Auth). O CSP em `next.config.ts` já libera `manifest-src 'self'`.

## 10. Comandos

```bash
# dev
pnpm dev:agenda-da-turma                                                # porta 3001

# verificação
pnpm --filter @informach/agenda-da-turma typecheck
pnpm --filter @informach/agenda-da-turma test                           # vitest
pnpm --filter @informach/agenda-da-turma exec biome check src

# build
pnpm build:agenda-da-turma                                              # produção (standalone output)
pnpm start:agenda-da-turma                                              # serve build local

# E2E
pnpm --filter @informach/agenda-da-turma e2e                            # Playwright (precisa do dev server up)
pnpm --filter @informach/agenda-da-turma e2e:install                    # baixa Chromium 1×
pnpm --filter @informach/agenda-da-turma e2e:ui                         # modo interativo

# teste isolado
pnpm --filter @informach/agenda-da-turma vitest run path/to/file.test.ts -t "test name"
pnpm --filter @informach/agenda-da-turma exec playwright test e2e/auth.signup-and-verify.spec.ts
```

---

## 11. Regras para agentes

1. **Mudar preço Pro**: editar `listPrice.amountCents` dos 2 produtos em `packages/config/src/products.ts` E atualizar Stripe Dashboard. Os dois lados precisam bater — divergência é bug.
2. **Adicionar nova feature de IA**: ver checklist em §2. Não pular `withCredits` — o gate de Pro+créditos é a única defesa contra Free consumindo IA.
3. **Ajustar cap de créditos**: editar `bonusCreditsPerMonth` nos 2 produtos Pro em `products.ts`. UI auto-reflete via `currentProduct.bonusCreditsPerMonth` no `CreditBalanceCard`.
4. **Stripe API version**: pinned em `2026-04-22.dahlia` no package `@informach/billing`. Bumpar requer validar payloads (ver `packages/billing/CLAUDE.md` §1).
5. **Free não chama IA** (quando IA existir): o gate é `billing.hasProSubscription`. Nunca contornar — Free com IA quebra economia.
6. **Single-user invariant**: `subject.type === "user"` em todo lugar. Não introduzir `organization` subject sem antes flipar `organizationsEnabled: true` no `createAuth` E `createBillingService` (decisão de produto, não code change isolado).
7. **`subject.id` é o `users.id` do `core` schema** (ver `lib/billing.ts:resolveSubjectEmail`). Não usar `users.email` como ID — o subject de billing é estável; email pode mudar.
8. **Webhook dunning** (`/api/jobs/billing-dunning/route.ts`) embute lógica de send inline (não usa wrapper `retryBillingDunningEmails` como cozya). Aceitável hoje; se a função crescer, extrair pra `features/billing/service.ts` igual cozya.
9. **`auth.signup-attempt-on-existing`** dispara para todos os usuários existentes (sem gate Pro). Manter assim — Pro-only gate vazava info via enumeration. Spam fica contido pelo rate limit `/sign-up/email` 5/h.
10. **Cron services no Railway**: NUNCA criar services novos. Editar `APP_DOMAINS` nos 7 cron-perapp existentes (ver §4 + `docs/deploy-runbook.md` Fase 11).
11. **Adicionar nova rota authenticated**: incluir o prefixo em `requireAuth` no `src/proxy.ts`. Default deny não está ligado — só os prefixos listados são gated.
12. **Não importar `@ai-sdk/openai` ou `@ai-sdk/anthropic` direto** quando IA chegar. Usar `createOpenRouter` de `@informach/ai-core/providers` (mesma regra do cozya §10.10). Whisper transcription pode usar `createOpenAI` apontando pra `https://openrouter.ai/api/v1`.
13. **Adicionar nova categoria de email**: ver `packages/emails/CLAUDE.md` §7 regra 3. A Agenda usa `auth.*`, `billing.*` e `agenda.routine`. O corpo de `agenda.routine` não é persistido para retry genérico: o job do app regenera com permissões atuais.
14. **Account deletion (LGPD)**: NÃO remover o hook `accountDeletion.onBeforeDelete` em `lib/auth.ts`. Sem ele, deletar a conta deixa subscriptions Stripe ativas e a cobrança continua.

---

## 12. Histórico relevante

- Commit `cb219f3` (per-app billing isolation): adicionou coluna `app` em `billing.{customers,credit_ledger,credit_reservations}`, UNIQUE composto `(provider, subjectType, subjectId, app)`. Permite que o mesmo `user.id` tenha customers Stripe distintos no cozya e na agenda. Migration `0020_exotic_wither.sql`.
- Commit `381e053` (site header com logo + theme toggle): SiteHeader em `/login` e `/signup`, AgendaLogo SVG inline.
- Sessão atual (replicar billing do cozya): full UX de billing — onboarding step 3, `/settings/billing`, `/upgrade`, dashboard widget Pro/Free, packs Pro-only, server actions e cron routes. Bug fix em `billing-dunning/route.ts` (URL `/admin/billing` que não existia → `/settings/billing`).


## Rotina familiar: limites de arquitetura e dados

- A identidade Informach é compartilhada entre apps. A exclusão informa o alcance global e bloqueia enquanto outro app tiver assinatura ativa/recuperável, antes de cancelar a Agenda. Não remover esse guard nem cancelar outros produtos implicitamente.

- Rotas e componentes não consultam o banco diretamente. Services coordenam autenticação, entitlement e repositórios; transações ficam nos repositórios.
- `features/family/access.ts` define acesso por criança. Convites/alterações/revogação usam lock por família. Não substituir autorização por gating visual de Pro.
- `features/notices` guarda fonte e providências, com `version`, `dateOrigin`, conclusão e responsável. A confirmação é atômica e idempotente por documento/criança (`notice_applications`), sem cobrar novamente pela extração reaproveitada para outro filho. Retificações pedem decisão explícita e versionam a ação existente com identificador e conclusão preservados.
- O escopo do original (`source_profile_ids`) é confirmado separadamente das ações e inclui crianças mencionadas sem providências. Até essa revisão, só titular e remetente com acesso atual podem ler o original. Permissões para convidados exigem acesso a todo o escopo. Rascunhos antigos mantêm escopo desconhecido; não inferir autorização por ausência de ações.
- Toda alteração de turma ativa revalida participação dentro do bloqueio de turma/perfil usado na revogação. `active_turma_id` sozinho não concede acesso. Histórico escolar autoriza cada snapshot; versões privadas anteriores à publicação não são devolvidas ao destinatário.
- O parser aceita referência de publicação identificada no original, com trecho de evidência. `noticeGenerationSchema` exige o campo nullable para geração estruturada; leitura de rascunhos anteriores aceita sua ausência. Ausência ou conflito da referência mantém datas relativas em aberto.
- `features/activities/pending-limit.ts` é a contagem única de pendências. As escritas de escola/extras/recados e reabertura usam o mesmo lock. Status de cada família é privado; correção compartilhada não o apaga.
- `features/notifications/delivery.ts` reconstrói a mensagem antes de enviar, respeita consentimento/silêncio/plano/acesso e usa claim idempotente. Resultado `deferred` do pacote de e-mail não cancela a notificação nem esgota tentativas; `unknown` exige reconciliação antes de reenviar. Finalização confere a reserva atual. Scheduler chama `routine:job` a cada cinco minutos e percorre cursores.
- `features/account/deletion.ts` cancela billing antes de limpar dados; falha preserva a conta. FKs de autoria permitem anonimização de atividades aceitas por outras famílias. Não prometer apagamento de cópias externas ou registros fiscais.
- Migrações 0035/0036 foram geradas pelo Drizzle. Os snapshots fazem parte da mudança. Não executar `db:push` em produção.
- Métricas aceitam somente metadados definidos no schema. Não registrar recado, anexo, nome de criança ou tokens privados. `pilot:report` usa consulta somente de leitura e eventos de fatura para pagamentos.
- Corpus de IA é opt-in (`test:ai-eval`) e usa provedor real; exemplos fictícios não provam precisão em recados reais. Integração e navegador exigem banco local e fixtures sintéticas.

## Página inicial e aquisição (setembro de 2026)

- A home está em `src/app/(marketing)/page.tsx`. A implementação da proposta está documentada em `docs/propostas/agenda-vendas-2026-09-12/IMPLEMENTACAO.md`.
- `components/marketing/sales.module.css` usa a fonte Jakarta e os tokens existentes, com estilos restritos ao layout público. O app autenticado mantém seu layout.
- A demonstração é local, com dados fictícios e estado React. Não recebe arquivos nem chama IA. Prazo escolar e planejamento da família são apresentados separadamente.
- O mensal é o padrão da home; `plans-content.ts` mostra o total anual cobrado, com equivalente mensal secundário. Preços continuam derivados do catálogo. CTA Pro preserva `plan=pro&cycle=mensal|anual` no cadastro.
- `features/metrics/landing-schema.ts` é o contrato público estrito. Visita, CTA e demonstração têm eventos distintos. `qualified_visit` continua significando o primeiro clique de cadastro por montagem da página; não converter silenciosamente em pageview.
- Migração 0039 adiciona `product_events.landing_context` nullable, sem backfill. Aplicar antes do novo código/relatório. Eventos não guardam conteúdo escolar nem identidade do visitante. `pilot:report` apresenta grupos agregados, sem atribuição individual entre visita e pagamento.
- Verificação da home: `pnpm --filter @informach/agenda-da-turma exec playwright test --config playwright.marketing.config.ts` contra o dev server local. O teste intercepta apenas analytics; navegação e interações são reais. Persistência é verificada separadamente na suíte de integração local.
