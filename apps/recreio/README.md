# Recreio

Portal da plataforma de jogos da Informach. Hoje dá para entrar com a conta Informach, criar o perfil, escolher quem joga neste aparelho e ver a estante (com o Morada, que ainda não abre) e a conta, com a situação do direito de jogar. Regras e limites em [CLAUDE.md](CLAUDE.md); escopo e lotes no [registro da frente](../../docs/recreio/implementacao.md).

## Abrir localmente

Precisa de um PostgreSQL local com as migrations aplicadas (`pnpm db:migrate` com o mesmo `DATABASE_URL`). Redis é opcional fora de produção; sem ele as sessões ficam no Postgres e `/api/ready` responde 503.

```bash
pnpm install
cp apps/recreio/.env.example apps/recreio/.env.local   # ajuste o DATABASE_URL e troque o segredo
pnpm dev:recreio                                        # http://localhost:3009
```

Com `EMAIL_SANDBOX_MODE=sandbox`, nenhum e-mail sai: os códigos de acesso ficam em arquivos dentro de `EMAIL_SANDBOX_DIR` (`apps/recreio/tmp/emails`).

Para testar a entrada: crie a conta em `/entrar`, confirme com o código de seis dígitos, crie o perfil em `/comecar` e a estante abre. "Entrar com código por e-mail" faz o mesmo sem senha. Com `RECREIO_ACCESS_MODE=fechado`, a estante para na explicação até a conta receber uma concessão.

## Liberar os jogos para uma conta

A cobrança ainda não existe: quem joga é quem a equipe liberou. Os dois scripts só precisam de `DATABASE_URL` e gravam a concessão junto com o evento de auditoria.

```bash
pnpm --filter @informach/recreio-app conceder --email pessoa@exemplo.com --tier individual --dias 30 --motivo alfa_equipe
pnpm --filter @informach/recreio-app revogar --email pessoa@exemplo.com --motivo fim_do_alfa
```

A conta precisa existir e ter o e-mail confirmado. `--tier` é `individual` (1 perfil) ou `family` (até 4); `--dias` vai de 1 a 366; `--motivo` é um código curto, com letras minúsculas, números e `_`. Um grupo tem uma concessão vigente por vez: para trocar, revogue antes. A saída mostra só ids e datas.

## Variáveis

| Variável | Para quê |
| --- | --- |
| `DATABASE_URL` | PostgreSQL compartilhado (contas, e-mails enviados e o schema `recreio`) |
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
pnpm --filter @informach/recreio-app test              # regras puras, textos, fronteira do acesso, contraste
pnpm --filter @informach/recreio-app test:integration  # banco descartável; ver abaixo
pnpm exec biome check apps/recreio
pnpm build:recreio                                     # precisa das variáveis acima (valores de exemplo servem)
```

`test:integration` roda `scripts/isolated.mjs`: cria um banco `recreio_review_<hex>` no PostgreSQL local apontado por `DATABASE_URL` (ou pelo `.env` da raiz), aplica as migrations, roda `test/*.integration.ts` e apaga o banco. Só aceita servidor em `localhost`, não usa Redis e não envia e-mail. Os testes cobrem perfil único por conta sob concorrência, ids trocados, sessão de aparelho, concessões com a auditoria na mesma transação, o direito de jogar por concessão e por assinatura, e as regras do schema (o mundo sobrevive à exclusão da conta, uma sessão de jogo aberta por perfil, uma posse aberta por mundo).

Ainda não há E2E; ele chega com as jornadas de `/jogar`.

## Estrutura

- `src/app`: `/`, `/entrar`, `/comecar`, `/perfis`, `(portal)/estante`, `(portal)/conta`, `/termos`, `/privacidade` e `api` (auth, health, ready, sair da conta, descadastro de e-mail).
- `src/features`: `account` (concluir a entrada, botão de sair), `sessao` (ator, sessão de aparelho, saída), `perfis` (criar e escolher), `acesso` (direito de jogar e o texto dele), `estante` (cartões do catálogo), `operations` (prontidão).
- `scripts`: `conceder` e `revogar` (concessões), `isolated.mjs` (banco descartável dos testes de integração).
- `test`: testes de integração e o apoio deles.
- `src/components`: marca, capa provisória do Morada, formulário de entrada, moldura das páginas de texto, navegação do portal.
- `src/lib`: auth, env, e-mails, Redis, logger, observabilidade, telemetria, destino do login.
- `src/proxy.ts`: CSP com nonce.
