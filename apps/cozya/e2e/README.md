# E2E — Cozya

Playwright cobre os fluxos de auth por email do Cozya que dependem de OTP: signup -> verificação por código -> sessão e sign-in opcional por código. Login por email/senha continua habilitado no app; quando houver spec dedicado, ele deve coexistir com esses fluxos OTP. A suíte usa o sandbox de email do `@informach/emails` em vez do SendGrid real.

## Pré-requisitos

1. PostgreSQL e Redis locais dedicados aos testes, sem reutilizar instâncias ou dados de produção.
2. Migrations aplicadas: `pnpm db:migrate`, com `DATABASE_URL` apontando explicitamente para o banco isolado.
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
   - `STRIPE_SECRET_KEY=sk_test_e2e`
   - `STRIPE_WEBHOOK_SECRET=whsec_e2e`
   - `OPENROUTER_API_KEY=sk-or-e2e`
   - Redis de teste ativo: o `webServer` da config usa `redis://localhost:6379/12`. Esse endereço deve pertencer ao ambiente de teste. Para outra porta, inicie o servidor Next separadamente com seu `REDIS_URL` isolado e use `E2E_SKIP_WEBSERVER=1`.
4. Browsers do Playwright: `pnpm --filter @informach/cozya e2e:install` (uma vez por versão instalada). Em CI Linux, use `pnpm --filter @informach/cozya exec playwright install --with-deps chromium`.

## Comandos

```bash
pnpm --filter @informach/cozya e2e     # headless, a partir da raiz
pnpm --filter @informach/cozya e2e:ui  # interface interativa
```

A `playwright.config.ts` sobe `pnpm exec next dev -p 3102` automaticamente (`webServer`); `E2E_PORT` permite escolher outra porta. Para rodar contra um servidor isolado já iniciado, defina `E2E_SKIP_WEBSERVER=1` e `E2E_BASE_URL` com a mesma origem local usada por `BETTER_AUTH_URL` e `NEXT_PUBLIC_APP_URL`, além do mesmo `EMAIL_SANDBOX_DIR`. Os contextos de navegador são criados pelo Playwright, sem usar o perfil pessoal.

## Tempos de espera no CI

As asserções aguardam até 15 segundos com `CI=1` e 5 segundos localmente. O CI usa `next dev`, que compila rotas sob demanda: a navegação pode ultrapassar o padrão de 5 segundos apesar de a ação e a resposta HTTP terem concluído com sucesso. A espera continua condicionada ao resultado de cada asserção; não há pausa fixa, remoção de critérios ou retries adicionais. O aquecimento de rotas pesadas e os limites de ação/teste existentes permanecem. Diagnóstico e resultado da rodada: [registro operacional de 17/10/2026](../../../docs/reviews/cozya-2026-09-11/operacao-e-piloto.md#estabilidade-do-e2e-no-ci--17102026).

## Como funciona o sandbox de email

Quando `EMAIL_SANDBOX_MODE=sandbox`, o `@informach/emails` grava cada email em `./tmp/integration_emails/<delivery-id>.json` (+ `.html`) em vez de chamar o SendGrid. A fixture `e2e/fixtures/email.ts` faz polling do diretório, casa por `to + category` e extrai o OTP de 6 dígitos do conteúdo renderizado.

## Limpeza entre runs

A suíte usa emails únicos com timestamp (`cozya-signup-<ts>@e2e.local`) — não há colisão por conta da `unique` em `users.email`. Use um banco local dedicado. Para limpeza, selecione somente os IDs das contas sintéticas criadas pela execução; nunca faça truncate em tabelas compartilhadas. O diretório `./tmp/integration_emails` pode ser apagado livremente entre runs.
