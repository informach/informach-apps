# Recreio

Portal da plataforma de jogos da Informach. Hoje é o esqueleto: entrar com a conta Informach, ver a estante (com o Morada, que ainda não abre) e a conta. Regras e limites em [CLAUDE.md](CLAUDE.md); escopo e lotes no [registro da frente](../../docs/recreio/implementacao.md).

## Abrir localmente

Precisa de um PostgreSQL local com as migrations aplicadas (`pnpm db:migrate` com o mesmo `DATABASE_URL`). Redis é opcional fora de produção; sem ele as sessões ficam no Postgres e `/api/ready` responde 503.

```bash
pnpm install
cp apps/recreio/.env.example apps/recreio/.env.local   # ajuste o DATABASE_URL e troque o segredo
pnpm dev:recreio                                        # http://localhost:3009
```

Com `EMAIL_SANDBOX_MODE=sandbox`, nenhum e-mail sai: os códigos de acesso ficam em arquivos dentro de `EMAIL_SANDBOX_DIR` (`apps/recreio/tmp/emails`).

Para testar a entrada: crie a conta em `/entrar`, confirme com o código de seis dígitos e a estante abre. "Entrar com código por e-mail" faz o mesmo sem senha.

## Variáveis

| Variável | Para quê |
| --- | --- |
| `DATABASE_URL` | PostgreSQL compartilhado (contas, e-mails enviados) |
| `BETTER_AUTH_SECRET` | Segredo das sessões, com 32 caracteres ou mais |
| `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` | Origem do app; em produção, HTTPS e iguais |
| `SENDGRID_API_KEY`, `SENDGRID_FROM` | Envio dos códigos de acesso |
| `EMAIL_SANDBOX_MODE`, `EMAIL_SANDBOX_DIR` | `live`, `sandbox` (arquivos) ou `memory`; produção exige `live` |
| `RECREIO_ACCESS_MODE` | `fechado` (padrão) ou `aberto` |
| `REDIS_URL` | Sessões e limites de tentativa; obrigatório em produção |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Erros; obrigatórios e iguais em produção |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Envio dos source maps no build |

A validação fica em `src/lib/environment.ts` e só cita o nome da variável recusada, nunca o valor. Cobrança, chaves de token, segredos das instâncias e preços entram com os próximos lotes.

## Verificar

```bash
pnpm --filter @informach/recreio-app typecheck
pnpm --filter @informach/recreio-app test     # ambiente, destino do login, telemetria, estante, contraste
pnpm exec biome check apps/recreio
pnpm build:recreio                            # precisa das variáveis acima (valores de exemplo servem)
```

Ainda não há testes de integração nem E2E; eles chegam com o schema e as jornadas.

## Estrutura

- `src/app`: `/`, `/entrar`, `(portal)/estante`, `(portal)/conta`, `/termos`, `/privacidade` e `api` (auth, health, ready, descadastro de e-mail).
- `src/features`: `account` (concluir a entrada, sair), `estante` (cartões do catálogo), `operations` (prontidão).
- `src/components`: marca, capa provisória do Morada, formulário de entrada, moldura das páginas de texto, navegação do portal.
- `src/lib`: auth, env, e-mails, Redis, logger, observabilidade, telemetria, destino do login.
- `src/proxy.ts`: CSP com nonce.
