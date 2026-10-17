# Bastidores em produção

Serviço `@informach/admin` (`67f2d87b-02cb-422a-b019-aa57cd584d14`) no projeto `informach-apps`, ambiente `production`, em `https://admin.informach.com.br`. A configuração do serviço e dos dois crons (`cron-admin-watch`, a cada 5 minutos, e `cron-admin-weekly`, segunda e terça às 11:00 UTC, com envio único por semana) está em [`.railway/railway.ts`](../../.railway/railway.ts). Fluxo geral de IaC no [runbook](../../docs/deploy-runbook.md#infraestrutura-como-código-railway-iac).

## Primeira publicação, nesta ordem

1. **Código e migrações na `main`.** O Bastidores depende das migrações `0072` (schema `ops`, com `job_runs` e `service_status`) e `0073` (colunas `failed_verification_count` e `locked_until` em `core.two_factors`, que o plugin de duas etapas do Better Auth 1.7 exige; sem elas a entrada quebra com "Drizzle schema mismatch"). As duas só acrescentam e são aplicadas pelo `migrator` no mesmo deploy; o `/api/ready` do admin segura o tráfego até o banco chegar lá.
2. **Domínio.** O Railway não registra domínio próprio pela IaC. No painel: `@informach/admin`, Settings, Networking, Custom Domain, `admin.informach.com.br`. No Cloudflare, CNAME `admin` para o destino que o Railway mostrar, com proxy desligado (DNS only). Conferir depois com `curl -sSI https://admin.informach.com.br/api/health`.
3. **Segredos próprios do serviço.** Nunca reaproveitar os de outro app: o segredo do Better Auth assina o cookie, e é ele que impede uma sessão de outro produto de valer aqui.

   ```bash
   railway variables --service "@informach/admin" --skip-deploys \
     --set "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" \
     --set "CRON_SECRET=$(openssl rand -base64 32)"
   ```

   No arquivo eles ficam como `preserve()`, e `preserve()` de variável ausente não cria nada. Por isso este passo vem antes do apply. Os crons do admin recebem o `CRON_SECRET` por referência.
4. **Configuração.** No topo de `.railway/railway.ts`, virar `ADMIN_LAUNCHED` para `true` (até aqui o arquivo espelha o esqueleto antigo e o plano fica zerado). Depois `railway config plan --verbose`: as mudanças esperadas são o build standalone, o start, o healthcheck `/api/ready`, o domínio, as variáveis do admin e os dois crons novos, sem nenhum destroy. Então `railway config apply`, e o commit da constante virada vai para a `main` no mesmo dia.
5. **Primeiro owner.** Dentro do Bastidores só um owner muda papéis, então o primeiro é gravado por script, uma vez, com a titular de acordo. O script não cria conta nem senha e se recusa a rodar se já houver owner:

   ```bash
   railway run --service Postgres -- sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" pnpm --filter @informach/admin bootstrap-owner <email>'
   ```

   O script grava `user.role_changed` com `source: "bootstrap-owner"`. A pessoa precisa já ter conta em algum produto. Os demais (admin para o suporte, ou outro owner) são promovidos por esse owner na ficha de cada pessoa, em "Mudar papel".
6. **Primeira entrada.** Em `admin.informach.com.br`, "Criar ou trocar a senha" manda um código para o e-mail (só sai para contas owner ou admin). Com a senha, a entrada leva à ativação das duas etapas: QR no aplicativo autenticador, códigos de recuperação guardados e o primeiro código. Sem duas etapas ativas, nenhuma tela abre.

## Conferência depois do deploy

- `GET /api/health` devolve o commit; `GET /api/ready` responde 200.
- Abrir uma ficha grava `admin.user_viewed` na Auditoria, com o nome de quem abriu.
- Em Operação, a rotina "Vigia" aparece com execução nos últimos 5 minutos, e cada serviço mostra "desde" depois da primeira volta da vigia.
- Os avisos de queda chegam às contas owner e a `ADMIN_ALERT_EMAILS`, quando definido.

## Opcional

- **Mais gente nos avisos.** Além das contas owner, `ADMIN_ALERT_EMAILS` (separado por vírgula) recebe os avisos de queda. Gravar no Railway e acrescentar `ADMIN_ALERT_EMAILS: preserve()` no bloco do admin, senão o plano propõe apagar a variável.

- **Usuário de banco só de leitura.** Mesmo sem ele, a conexão das telas abre toda transação em modo só leitura (`default_transaction_read_only`). Com ele, nem um engano de configuração escreve. Criar no Postgres e gravar `READONLY_DATABASE_URL` (como `preserve()` no arquivo):

  ```sql
  CREATE ROLE bastidores_leitura LOGIN PASSWORD '<gerada>';
  GRANT CONNECT ON DATABASE <banco, o valor de PGDATABASE> TO bastidores_leitura;
  GRANT USAGE ON SCHEMA core, billing, audit, ai, ops, edi, cozya, agenda, missao_saber TO bastidores_leitura;
  GRANT SELECT ON ALL TABLES IN SCHEMA core, billing, audit, ai, ops, edi, cozya, agenda, missao_saber TO bastidores_leitura;
  ALTER DEFAULT PRIVILEGES IN SCHEMA core, billing, audit, ai, ops, edi, cozya, agenda, missao_saber GRANT SELECT ON TABLES TO bastidores_leitura;
  ```

  O `ALTER DEFAULT PRIVILEGES` vale para tabelas criadas pelo mesmo papel que roda as migrações.
- **Sentry.** Projeto `admin` no Sentry e `SENTRY_DSN`. Para os links e a contagem de erros abertos por app em Operação: `SENTRY_ORG_SLUG` e `SENTRY_READ_TOKEN` (escopo `event:read`). Ao criar, acrescentar as três como `preserve()` no bloco do admin.
