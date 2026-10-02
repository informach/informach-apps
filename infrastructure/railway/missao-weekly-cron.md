# Missão Saber: cron semanal

O serviço `Missao Weekly Cron` usa o repositório `informach/informach-apps`, branch `main`, e o Dockerfile `infrastructure/railway/missao-weekly-cron.Dockerfile`. O script é copiado da mesma revisão do Git; não deve ser duplicado no comando de inicialização do painel. A imagem base preserva o digest que já era usado em produção.

Configuração do serviço existente (`446b4a71-3a35-4be3-be99-743ac72688e3`):

- Source: repositório GitHub acima, sem `source.image`.
- Builder: `DOCKERFILE`; Dockerfile conforme o caminho acima; diretório raiz `/`.
- Watch patterns: `/apps/missao-saber/scripts/weekly-report-cron.sh` e `/infrastructure/railway/missao-weekly-cron*`.
- Start command: `sh /app/weekly-report-cron.sh`.
- Cron: `0 12 * * 1,2` (segunda e terça, 09h em São Paulo).
- Restart policy: `NEVER`.
- Preservar `APP_ORIGIN`, `CRON_SECRET`, `SENTRY_DSN` e `SENTRY_ENVELOPE_URL` existentes. Nenhum segredo pertence à imagem.

Na primeira implantação, publicar o app e aplicar a migração 0064 antes de conectar este serviço ao GitHub. Depois, conferir o commit da imagem e a configuração efetiva. Não usar a execução manual do job como teste: ela pode enviar os resumos reais das famílias.

Validação local, na raiz:

```sh
docker build -f infrastructure/railway/missao-weekly-cron.Dockerfile -t missao-weekly-review .
docker run --rm missao-weekly-review sh -n /app/weekly-report-cron.sh
pnpm --filter @informach/missao-saber exec vitest run --config vitest.tools.config.ts tools/weekly-cron.tool.ts
```

Após o deploy do app, executar `production:verify-schema` com `DATABASE_PUBLIC_URL` fornecida apenas no ambiente do processo. O verificador exige todas as migrações do checkout, as quatro colunas novas, o índice válido e a FK com `ON DELETE SET NULL`.

Rollback: reverter o código no Git ou restaurar o último deploy compatível, mantendo a migração aditiva. Não remover colunas nem apagar checkpoints para reverter a interface. O cron e o app precisam continuar entendendo o mesmo protocolo de lotes.

Referências operacionais: [Dockerfiles](https://docs.railway.com/builds/dockerfiles) e [cron jobs](https://docs.railway.com/cron-jobs).
