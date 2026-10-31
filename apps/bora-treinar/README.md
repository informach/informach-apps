# Bora Treinar

Treino guiado com o peso do corpo (calistenia) para a família, em `bora-treinar.informach.com.br`. **Ainda não publicado**: o provisionamento de Stripe, Sentry, DNS e Railway está em [PRODUCAO.md](PRODUCAO.md).

Um instrutor 3D mostra cada exercício, a câmera conta as repetições e o tempo de prancha no próprio aparelho (MediaPipe no navegador) e cada perfil da família sobe de nível nas trilhas de progressão. Tem desafio semanal da família, conquistas, editor de treinos, lembretes de treino e resumo semanal por e-mail, e o celular pode servir de câmera quando o treino passa na TV.

A conta é do titular (adulto), com perfis familiares só de apelido e cor, como na Missão Saber. Planos:

| Plano | Mensal | Anual | Perfis |
| --- | --- | --- | --- |
| Grátis | | | 1, com o "Primeiro treino", a biblioteca de exercícios com o instrutor 3D e contagem manual |
| Bora Treinar Individual | R$ 24,90 | R$ 249,00 | 1 |
| Bora Treinar Família | R$ 34,90 | R$ 349,00 | até 4 |

Sem IA e sem créditos. Preços no catálogo (`packages/config/src/products.ts`); os ids Stripe vêm das variáveis `BORA_{INDIVIDUAL,FAMILY}_{MONTHLY,ANNUAL}_PRICE`.

## Abrir localmente

Requisitos: Node e pnpm conforme o manifest e o CI do monorepo, e PostgreSQL local.

```powershell
pnpm install --frozen-lockfile
pnpm --filter @informach/bora-treinar preview:setup
pnpm dev:bora-treinar
```

`preview:setup` lê o `DATABASE_URL` local da raiz, cria um banco `bora_preview_<uuid>`, aplica as migrations nele e grava `.env.local` ignorado pelo Git. Recusa destino remoto e não sobrescreve um `.env.local` que já exista. O app abre em `http://localhost:3007`.

O `dev` e o `build` rodam antes `scripts/fetch-assets.mjs` (também disponível como `pnpm --filter @informach/bora-treinar assets`): ele copia o runtime WASM do `@mediapipe/tasks-vision` instalado para `public/mediapipe/wasm` e baixa o modelo `pose_landmarker_lite.task`, conferido por SHA-256. O detector roda servido pela própria origem, sem CDN de terceiros; a primeira execução precisa de rede para o download do modelo.

E-mails ficam em modo sandbox no local, gravados em `tmp/emails`; a Stripe local usa chave de teste.

## Verificar

```powershell
pnpm --filter @informach/bora-treinar test
pnpm --filter @informach/bora-treinar test:integration
pnpm --filter @informach/bora-treinar e2e
pnpm --filter @informach/bora-treinar typecheck
pnpm build:bora-treinar
```

Integração e E2E criam e removem o próprio banco local (`bora_review_<uuid>`) e recusam banco remoto. O E2E compila e sobe uma aplicação de produção isolada, em Chromium desktop e Pixel 7, na porta 3107 (`BORA_E2E_PORT` troca a porta quando ela estiver ocupada); as evidências de falha ficam em `tmp/verification/`, que o CI guarda como artefato.

## Estrutura

```
apps/bora-treinar/
├── scripts/
│   ├── fetch-assets.mjs        # WASM e modelo de pose em public/mediapipe
│   ├── isolated.mjs            # banco descartável para preview, integração e E2E
│   ├── maintenance-cron.sh     # cron da cobrança: /api/ready e /api/jobs/billing
│   └── lembretes-cron.sh       # cron dos lembretes: /api/ready e /api/jobs/lembretes
└── src/
    ├── app/api/                # auth, health, ready, jobs, webhooks Stripe e SendGrid, descadastro
    ├── features/
    │   ├── treino/             # núcleo portado do EdiBody
    │   │   ├── body/           # landmarks, poses, esqueleto e cadência
    │   │   ├── engine/         # contador de repetições, runner da sessão, progressão, voz
    │   │   ├── catalog/        # exercícios, trilhas e treinos prontos
    │   │   ├── instructor/     # instrutor 3D (three.js)
    │   │   └── vision/         # rastreador de pose do MediaPipe
    │   ├── familia/            # perfis, preferências, backup
    │   ├── meus-treinos/       # editor de treinos
    │   ├── sessoes/            # registro das sessões e séries
    │   ├── desafios/           # desafio semanal da família
    │   ├── conquistas/         # conquistas por perfil
    │   ├── acesso/             # o que cada plano libera
    │   ├── billing/            # assinatura, troca de plano e manutenção
    │   └── account/, operations/
    └── lib/                    # env, auth, redis, e-mails, observabilidade, job-runs
```

O núcleo de `features/treino` veio do protótipo EdiBody; o resto (conta, cobrança, banco, e-mails, auditoria) segue o mesmo desenho da Missão Saber e usa os packages compartilhados (`@informach/auth`, `billing`, `config`, `db`, `emails`). As tabelas ficam no schema `bora_treinar` (`packages/db/src/schema/bora-treinar.ts`) e tudo cai em cascata a partir de `core.users`.

## Decisões principais

- O detector de pose roda no navegador; o banco guarda só o resultado de cada série (repetições, segundos, avisos de execução), nunca imagem. Antes de prometer em página pública que nenhuma imagem passa pelo servidor, conferir o caminho do pareamento celular → TV.
- Perfis guardam só apelido e cor. Eventos de auditoria `bora.*` levam IDs, nomes de campo e contagens (ver `docs/audit-payload-policy.md`).
- Sessões no Redis do app (`bora-treinar:auth:`), sem cache em cookie: encerrar sessões pelo Bastidores vale na hora.
- Lembretes (`bora.reminder`) e resumo semanal (`bora.weekly-summary`) são montados pelo app no momento do envio e não têm o corpo persistido.
- Rotinas agendadas passam por `recordJobRun` com app `bora-treinar` e jobs `billing` e `lembretes`, que o Bastidores acompanha em Operação.
