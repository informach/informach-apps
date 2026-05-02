# E2E — Cozya

Playwright cobre os fluxos OTP do Cozya (signup -> verificação por código -> sessão e sign-in por código) usando o sandbox de email do `@informach/emails` em vez do SendGrid real.

## Pré-requisitos

1. Postgres rodando (`docker compose up -d` na raiz).
2. Migrations aplicadas: `pnpm db:migrate`.
3. `.env.local` com no mínimo:
   - `DATABASE_URL`
   - `BETTER_AUTH_SECRET` (qualquer string ≥ 32 chars)
   - `BETTER_AUTH_URL=http://localhost:3002`
   - `NEXT_PUBLIC_APP_URL=http://localhost:3002`
   - `SENDGRID_API_KEY=test`
   - `SENDGRID_FROM=test@example.com`
   - `EMAIL_SANDBOX_MODE=sandbox`
   - `EMAIL_SANDBOX_DIR=./tmp/integration_emails`
   - `CRON_SECRET` (qualquer string ≥ 32 chars)
   - `REDIS_URL` vazio ou um Redis local ativo. A config do Playwright força vazio para usar Postgres nos testes.
4. Browsers do Playwright: `pnpm e2e:install` (uma vez).

## Comandos

```bash
pnpm e2e            # headless
pnpm e2e:ui         # interactive UI
```

A `playwright.config.ts` sobe `pnpm dev` automaticamente (`webServer`). Para rodar contra um server já em pé, use `E2E_SKIP_WEBSERVER=1 pnpm e2e`.

## Como funciona o sandbox de email

Quando `EMAIL_SANDBOX_MODE=sandbox`, o `@informach/emails` grava cada email em `./tmp/integration_emails/<delivery-id>.json` (+ `.html`) em vez de chamar o SendGrid. A fixture `e2e/fixtures/email.ts` faz polling do diretório, casa por `to + category` e extrai o OTP de 6 dígitos do conteúdo renderizado.

## Limpeza entre runs

A suíte usa emails únicos com timestamp (`cozya-signup-<ts>@e2e.local`) — não há colisão por conta da `unique` em `users.email`. Se quiser zerar tudo, `truncate core.users cascade;` ou recriar o banco. O diretório `./tmp/integration_emails` pode ser apagado livremente entre runs.
