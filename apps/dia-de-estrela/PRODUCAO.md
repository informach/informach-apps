# Operação do Dia de Estrela

**Ainda não publicado.** O código, os testes e a documentação entraram na `main` em 06/11/2026; o serviço não existe no Railway (`ESTRELA_LAUNCHED = false`). Nada foi criado no Stripe, no Sentry, no Railway ou no Cloudflare. Este registro diz o que falta e em que ordem; datas e identificadores reais entram aqui conforme forem criados, nunca segredos.

Destino previsto: `https://dia-de-estrela.informach.com.br`, no projeto Railway `informach-apps`, ambiente `production`, com o PostgreSQL e o Redis compartilhados.

## Frente Compasso (10/11/2026)

A branch em implementação substitui a venda individual pelo Compasso e o login local pela central. **Não provisionar o antigo produto Família nem usar a sequência histórica abaixo para lançar esta branch.** Catálogo e operação comercial atuais estão em [Minha conta](../conta/PRODUCAO.md).

Desde 11/11/2026 (branch `feat/compasso-corte`) o app não tem cobrança própria: como nunca vendeu, não há contrato anterior a conciliar. Saíram o serviço Stripe, o webhook, a rotina `/api/jobs/billing`, o cron `cron-dia-de-estrela-billing`, os produtos `estrela_family_*` do catálogo e as variáveis `STRIPE_*` e `ESTRELA_FAMILY_*`. O acesso vem só da cobertura Compasso da família. O inventário somente de leitura do corte confere que não há cliente nem contrato com `app = 'dia-de-estrela'` em produção.

O contrato de dados exige as migrations até `0116`; `/api/ready` não deve ser contornado. `0115` aborta proveniência conflitante e preserva históricos/credenciais válidas; `0116` remove convites locais e identidade duplicada. Há ensaio histórico isolado, mas não há ensaio de corte em produção. Sessões web são vinculadas à central; Redis continua para pub/sub e jobs. O cursor dos alertas passa a `dia-de-estrela:jobs:alertas:group-cursor`.

Gates e pendências de lançamento no [registro Compasso](../../docs/propostas/assinatura-web-2026-11-09/implementacao.md). A seção seguinte descreve a preparação anterior à decisão Compasso, preservada como histórico operacional; ela não autoriza criar produtos ou serviços.

## Serviços previstos

| Recurso | Configuração | Estado |
| --- | --- | --- |
| Aplicação | `@informach/dia-de-estrela` em `.railway/railway.ts`: Railpack, `standaloneNext("dia-de-estrela")`, healthcheck `/api/ready` com 30 s, domínio `dia-de-estrela.informach.com.br`, rede privada `informachdia-de-estrela` | declarado; entra no projeto com `ESTRELA_LAUNCHED = true` |
| Crons | `cron-dia-de-estrela-alertas` (`scripts/alertas-cron.sh`, `/api/jobs/alertas`), imagem `alpine/curl` (`CURL_IMAGE`), `*/5 * * * *`. A rotina dos alertas para em 50 s e guarda onde parou no Redis. A avaliação e o encerramento de conta usam `cron-dia-de-estrela-account-departure`, do Compasso | declarados; entram com `ESTRELA_LAUNCHED` (e o do Compasso com `COMPASSO_LAUNCHED`) |
| PostgreSQL | Compartilhado; schema `dia_de_estrela`, migração `0078_dia_de_estrela` | aplicada pelo migrator no primeiro deploy depois do merge |
| Redis | Compartilhado; sessões `dia-de-estrela:auth:` (sem cache em cookie), tempo real `dia-de-estrela:familia:*` (pub/sub) e lease da cobrança `dia-de-estrela:jobs:billing:*` | `REDIS_URL` com `?family=0` |
| Sentry | Projeto `dia-de-estrela` na organização `informach-nucleo-de-aprendizag` | a criar |
| Cloudflare | CNAME `dia-de-estrela` para o domínio do Railway, proxy ligado | a criar antes do apply que cria o cron (gotcha 5 do runbook) |
| SendGrid | Fila compartilhada; remetente `Dia de Estrela <nao-responda@informach.com.br>`; só códigos de acesso e cobrança | domínio já verificado |
| Bastidores | `bastidores_leitura` precisa de `USAGE`/`SELECT` no schema `dia_de_estrela` (`apps/admin/PRODUCAO.md`) | em 06/11/2026 o Bastidores usa o papel principal; GRANT só se `bastidores_leitura` passar a ser usado |

## Cobrança

Nenhuma no app. O plano da família é o Compasso, cobrado e conciliado pela Conta. Não criar produto, preço, portal ou webhook do Dia de Estrela no Stripe.

## Variáveis

`DATABASE_URL`, `BETTER_AUTH_*`, `NEXT_PUBLIC_APP_URL`, `SENDGRID_*`, `EMAIL_SANDBOX_MODE=live`, `REDIS_URL`, `SENTRY_*`, `CRON_SECRET` e:

- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`: par próprio do app (`pnpm dlx web-push generate-vapid-keys`), para o push dos alertas. Produção recusa subir sem eles.

Produção também recusa e-mail sandbox, Redis ou Sentry ausentes, webhook do SendGrid sem chave e URLs que não sejam a mesma origem HTTPS (`src/lib/environment.ts`). No cron dos alertas: `APP_ORIGIN`, `CRON_SECRET`, `SENTRY_DSN`, `SENTRY_ENVELOPE_URL`.

## Ordem do lançamento

O Dia de Estrela sobe junto com o corte Compasso, porque a Conta exige o worker de encerramento de todos os apps do catálogo (`COMPASSO_LAUNCHED` exige `ESTRELA_LAUNCHED`). A sequência do corte está em [Minha conta](../conta/PRODUCAO.md). Para este app:

1. Sentry (projeto `dia-de-estrela`) e par VAPID.
2. Criar o serviço vazio e registrar o domínio pela CLI (a IaC não registra domínio), CNAME no Cloudflare.
3. Gravar as variáveis acima.
4. `ESTRELA_LAUNCHED = true` com `COMPASSO_LAUNCHED = true`, `railway config plan` (só adições), `railway config apply` com autorização. A partir daí a constante não volta para `false`.
5. Primeiro deploy, `/api/ready` 200, alertas e encerramento registrados em `ops.job_runs`.
6. Cartão no site institucional (`apps/informach-site`) só quando a titular decidir anunciar.

## Pendências fora da infraestrutura

- Checar domínio e registro "Dia de Estrela" no INPI (decisão de 06/11/2026).
- Mostrar as telas a 3–5 famílias, de preferência com uma criança autista e um terapeuta ocupacional, com atenção ao lembrete e à comemoração.
- Revisão jurídica dos termos e da privacidade do app antes da venda.
- Testar num tablet e num iPhone reais: som depois do "Começar o dia", tela acesa, push no iPhone (exige o app na tela de início).
- Os lembretes tocam só com o app aberto e a tela acesa (limite do navegador). Notificação com o app fechado exigiria app nativo.
