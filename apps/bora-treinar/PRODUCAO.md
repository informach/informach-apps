# Operação do Bora Treinar

**Ainda não publicado.** O app está implementado localmente na branch `feat/bora-treinar`. Nada abaixo foi provisionado: não há produto Stripe, projeto Sentry, DNS, serviço Railway nem migração aplicada em produção. Ao concluir cada passo, registrar aqui a data e os identificadores reais (nunca segredos), como em `apps/missao-saber/PRODUCAO.md`.

Destino: `https://bora-treinar.informach.com.br`, no projeto Railway `informach-apps`, ambiente `production`, com o PostgreSQL e o Redis compartilhados.

## Serviços

| Recurso | Configuração prevista | Estado |
| --- | --- | --- |
| Aplicação | Serviço `@informach/bora-treinar` em `.railway/railway.ts`: Railpack, `standaloneNext("bora-treinar")`, healthcheck `/api/ready` com 30 s, domínio `bora-treinar.informach.com.br`, rede privada `informachbora-treinar` | pendente |
| Cron da cobrança | `cron-bora-treinar-billing`, imagem `alpine/curl` (`CURL_IMAGE`), `*/5 * * * *`, roda `scripts/maintenance-cron.sh` | pendente |
| Cron dos lembretes | `cron-bora-treinar-lembretes`, imagem `alpine/curl`, `0 * * * *`, roda `scripts/lembretes-cron.sh` | pendente |
| PostgreSQL | Compartilhado; schema `bora_treinar`, criado pela migração `0075_bora_treinar` | pendente |
| Redis | Compartilhado; sessões com prefixo `bora-treinar:auth:` (sem cache em cookie) e lease da manutenção em `bora-treinar:jobs:billing:*` | pendente |
| Sentry | Projeto `bora-treinar` na organização da casa | pendente |
| Cloudflare | CNAME de `bora-treinar` para o domínio Railway do serviço, proxy ligado | pendente |
| SendGrid | Fila compartilhada, webhook assinado já existente | pendente (conferir remetente) |

O build executa `pnpm install --frozen-lockfile --prod=false && pnpm build:bora-treinar`, copia `public/` e `.next/static` para o standalone e o start roda `node apps/bora-treinar/.next/standalone/apps/bora-treinar/server.js`. O `build` do app roda antes `scripts/fetch-assets.mjs`, que copia o WASM do MediaPipe e **baixa o modelo de pose** de `storage.googleapis.com` (conferido por SHA-256): o build no Railway precisa dessa saída de rede. `/api/ready` confere banco e Redis; `/api/health` diz o commit servido.

Produção recusa chave Stripe de teste, e-mail sandbox, Redis ou Sentry ausentes, webhook do SendGrid sem chave, portal sem `bpc_`, qualquer um dos quatro preços ausente e URLs que não sejam a mesma origem HTTPS (`src/lib/environment.ts`).

## Stripe

| Plano | Mensal | Anual | Perfis | Id no catálogo |
| --- | --- | --- | --- | --- |
| Bora Treinar Individual | R$ 24,90 | R$ 249,00 | 1 | `bora_individual_monthly`, `bora_individual_annual` |
| Bora Treinar Família | R$ 34,90 | R$ 349,00 | até 4 | `bora_family_monthly`, `bora_family_annual` |

Sem créditos de IA e sem pacote de créditos. Passos, primeiro em modo teste e depois em produção:

1. [ ] Criar os produtos Bora Treinar Individual e Bora Treinar Família, com descrição em linguagem natural e o ícone do app.
2. [ ] Criar os quatro preços recorrentes em BRL (mensal e anual de cada produto) e gravar os ids em `BORA_INDIVIDUAL_MONTHLY_PRICE`, `BORA_INDIVIDUAL_ANNUAL_PRICE`, `BORA_FAMILY_MONTHLY_PRICE` e `BORA_FAMILY_ANNUAL_PRICE`. Atualizar também `stripePriceId.{dev,prod}` em `packages/config/src/products.ts`, que hoje tem `price_TODO_*`: o webhook resolve o produto pelo preço.
3. [ ] Criar uma configuração do Customer Portal própria do app (pagamento, faturas e cancelamento; troca de plano fica no app) e gravar o `bpc_…` em `STRIPE_PORTAL_CONFIGURATION_ID`. Termos e Privacidade apontam para `informach.com.br`.
4. [ ] Criar o endpoint de webhook em `https://bora-treinar.informach.com.br/api/webhooks/stripe` com os eventos do pacote de cobrança (checkout concluído e expirado, assinatura criada, alterada e encerrada, fatura paga e com falha) e gravar o `whsec_…` em `STRIPE_WEBHOOK_SECRET`.
5. [ ] Homologar em modo teste: checkout abandonado e concluído, Família com quatro perfis, upgrade com prorrateio, downgrade agendado (escolha do perfil que continua ativo), falha de pagamento, Portal e cancelamento.

## Variáveis

Serviço `@informach/bora-treinar` (todas `preserve()` no arquivo, exceto `RAILPACK_NODE_VERSION`, lida do `.nvmrc`):

- `NODE_ENV=production`, `NPM_CONFIG_PRODUCTION=false`, `LOG_LEVEL`
- `DATABASE_URL`, `REDIS_URL` (com `?family=0` no Railway)
- `BETTER_AUTH_SECRET` (novo, 32+ caracteres), `BETTER_AUTH_URL` e `NEXT_PUBLIC_APP_URL`, ambos `https://bora-treinar.informach.com.br`
- `CRON_SECRET` (novo, 32+ caracteres, o mesmo nos dois crons)
- `SENDGRID_API_KEY`, `SENDGRID_FROM`, `SENDGRID_WEBHOOK_PUBLIC_KEY`, `EMAIL_SANDBOX_MODE=live`
- `STRIPE_MODE=prod`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PORTAL_CONFIGURATION_ID` e os quatro `BORA_*_PRICE`
- `SENTRY_DSN` e `NEXT_PUBLIC_SENTRY_DSN` (iguais), `SENTRY_ORG`, `SENTRY_PROJECT=bora-treinar`, `SENTRY_AUTH_TOKEN` (upload de source maps no build)

Opcionais, lidas pelo app mas ainda fora do arquivo de IaC: `BORA_CONTENT_MANAGER_EMAILS`, `BORA_CONTENT_MANAGER_IDS` e `BORA_METRICS_EXCLUDED_EMAILS`. Quem gravar alguma delas no Railway acrescenta `preserve()` no bloco do serviço, senão o próximo plano propõe apagar.

Crons `cron-bora-treinar-billing` e `cron-bora-treinar-lembretes`: `APP_ORIGIN=https://bora-treinar.informach.com.br`, `CRON_SECRET` (o do app), `SENTRY_DSN` (o do app) e `SENTRY_ENVELOPE_URL` (endpoint de envelope do projeto `bora-treinar`).

## Ordem do primeiro deploy

1. [ ] Sentry: criar o projeto `bora-treinar` e anotar DSN e endpoint de envelope.
2. [ ] Stripe: passos 1 a 4 acima, em produção.
3. [ ] Integrar a branch em `main` com o CI verde. O push dispara o `migrator`, que aplica `0075_bora_treinar`; conferir `[db:migrate] done.` no log.
4. [ ] `railway config plan` pelo PowerShell (ver `docs/deploy-runbook.md`, "Infraestrutura como código"). O plano deve **criar** só `@informach/bora-treinar`, `cron-bora-treinar-billing` e `cron-bora-treinar-lembretes`; qualquer linha de destroy é motivo para parar.
5. [ ] `railway config apply`, gravar as variáveis acima nos três serviços e fazer o primeiro deploy do app.
6. [ ] Cloudflare: CNAME `bora-treinar` para o domínio Railway do serviço, proxy ligado; conferir o certificado.
7. [ ] Conferir `/api/ready` (200), o commit em `/api/health` e os assets em `/mediapipe/`.
8. [ ] Bastidores: se o papel `bastidores_leitura` já existia, rodar os `GRANT` do schema `bora_treinar` (`apps/admin/PRODUCAO.md`); conferir a aba Bora Treinar em Produtos e as rotinas `billing` e `lembretes` em Operação.
9. [ ] Smoke: cadastro com OTP real (entrega `delivered`), primeiro treino grátis com contagem manual e pela câmera, compra real Individual, Portal, cancelamento.

O app não entra em `APP_DOMAINS` dos crons per-app: como a Missão, tem cron próprio de cobrança (`/api/jobs/billing`, com lease e cursor no Redis: reconciliação e inadimplência).

## E-mail, jobs e observabilidade

- `POST /api/jobs/billing`: manutenção da cobrança, a cada 5 minutos, `Authorization: Bearer $CRON_SECRET`. O cron confere `/api/ready` antes e manda falha ao Sentry.
- `POST /api/jobs/lembretes`: de hora em hora. Envia o lembrete de treino (`bora.reminder`) nos dias e na hora local escolhidos pelo titular, só se ninguém da família treinou no dia, e o resumo semanal de segunda-feira (`bora.weekly-summary`), por perfil, só para quem ligou a opção. A chave de mensagem evita envio duplicado; o corpo não é persistido.
- As duas rotas gravam a execução em `ops.job_runs` (`recordJobRun`, app `bora-treinar`, jobs `billing` e `lembretes`), que o Bastidores acompanha.
- [ ] Definir e registrar aqui o remetente (`SENDGRID_FROM`) e confirmar que o domínio dele está autenticado no SendGrid.
- O Sentry recebe `environment` e `release` do Railway; só erros viram eventos.

## Banco e recuperação

A migração `0075_bora_treinar` só cria o schema `bora_treinar` e as tabelas novas; não altera tabelas de outros produtos, então aplicá-la antes do deploy do app é seguro para Cozya, Agenda, Missão e Edi. Tudo cai em cascata a partir de `core.users`: a exclusão da conta Informach apaga os dados do app sem passo extra. Em falha do app, promover o último deployment saudável; nunca usar `db:push` nem restaurar o banco compartilhado como rollback de código.

## Pendências fora da infraestrutura

- [ ] Termos de uso e política do app (ou decisão de usar só os guarda-chuva de `informach.com.br`), e link na cláusula 3 dos Termos do site quando existirem.
- [ ] Revisão do texto de privacidade sobre a câmera e o pareamento celular → TV antes de qualquer promessa pública sobre imagens.
- [ ] Monitor de uptime: como na Missão, o monitor operacional é o próprio cron, que reporta ao Sentry.
