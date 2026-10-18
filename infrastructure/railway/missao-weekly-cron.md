# Missão Saber: cron semanal

O serviço `cron-missao-saber-weekly-report` (`446b4a71-3a35-4be3-be99-743ac72688e3`) é declarado em [`.railway/railway.ts`](../../.railway/railway.ts): repositório `informach/informach-apps`, branch `main`, builder `DOCKERFILE` com `infrastructure/railway/missao-weekly-cron.Dockerfile`, start `sh /app/weekly-report-cron.sh`, cron `0 12 * * 1,2` (segunda e terça, 09h em São Paulo; a terça só reenvia o que falhou), reinício `NEVER`. O script é copiado para a imagem da mesma revisão do Git; não deve ser duplicado no start command. A imagem base preserva o digest que já era usado em produção. Configuração de serviço muda no arquivo, com `railway config plan` e `railway config apply`, não no painel.

`APP_ORIGIN`, `CRON_SECRET`, `SENTRY_DSN` e `SENTRY_ENVELOPE_URL` ficam no Railway (`preserve()` no arquivo) e são copiados do app por `python apps/missao-saber/scripts/production.py sync-cron-variables`. Nenhum segredo pertence à imagem.

Não usar a execução manual do job como teste: ela pode enviar os resumos reais das famílias.

Validação local, na raiz:

```sh
docker build -f infrastructure/railway/missao-weekly-cron.Dockerfile -t missao-weekly-review .
docker run --rm missao-weekly-review sh -n /app/weekly-report-cron.sh
pnpm --filter @informach/missao-saber exec vitest run --config vitest.tools.config.ts tools/weekly-cron.tool.ts
```

Após o deploy do app, executar `production:verify-schema` com `DATABASE_PUBLIC_URL` fornecida apenas no ambiente do processo. O verificador exige todas as migrações do checkout.

Rollback: reverter o código no Git ou restaurar o último deploy compatível, mantendo a migração aditiva. Não remover colunas nem apagar checkpoints para reverter a interface. O cron e o app precisam continuar entendendo o mesmo protocolo de lotes.

Referências operacionais: [Dockerfiles](https://docs.railway.com/builds/dockerfiles) e [cron jobs](https://docs.railway.com/cron-jobs).
