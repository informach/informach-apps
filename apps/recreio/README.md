# Recreio

Portal da plataforma de jogos da Informach. Hoje dá para entrar com a conta Informach, criar o perfil, escolher quem joga neste aparelho, ver a estante e a conta com a situação do direito de jogar, criar mundos e chamar outras pessoas por código de convite. O portal também atende os jogos: emite o ingresso e a sessão de jogo (API do SDK) e guarda a posse, o diário e as fotografias dos mundos para os servidores de jogo (API das instâncias). A página que abre o jogo (`/jogar`) ainda não existe. Regras e limites em [CLAUDE.md](CLAUDE.md); escopo e lotes no [registro da frente](../../docs/recreio/implementacao.md).

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

## Jogos, instâncias e chaves

Um servidor de jogo fala com o portal por `/api/interno/v1`, com o segredo do jogo. Para um jogo abrir mundos localmente:

- `RECREIO_HOST_SECRETS` precisa ter o segredo do jogo (o servidor do jogo usa o mesmo valor);
- `RECREIO_GAME_ORIGINS` precisa ter o endereço público das instâncias dele (`ws`), que é o único endereço com que uma instância consegue se registrar e para onde o navegador é mandado.

Os tokens (ingresso de 60 s e sessão de jogo de 15 min) são assinados com uma chave Ed25519. Fora de produção, sem `RECREIO_TOKEN_PRIVATE_KEY`, o app gera um par descartável ao subir e avisa no log: os tokens deixam de valer a cada reinício. Para uma chave fixa (produção exige):

```bash
pnpm --filter @informach/recreio-app gerar-chave
```

O comando mostra `RECREIO_TOKEN_KEY_ID` e `RECREIO_TOKEN_PRIVATE_KEY` (PEM numa linha, com `\n` escapado) para copiar ao provedor. A chave pública servida em `/api/sdk/v1/jwks` sai da privada. Na rotação, a pública da chave antiga entra em `RECREIO_TOKEN_PREVIOUS_PUBLIC_KEYS` com o id dela e fica lá até as sessões assinadas por ela vencerem (15 min bastam).

A manutenção (`POST /api/jobs/manutencao`, com `Authorization: Bearer $CRON_SECRET`) fecha posses vencidas, marca instâncias caladas, apaga ingressos antigos e encerra sessões de jogo sem renovação. Responde só contagens e pode rodar a qualquer intervalo; nada do caminho de jogo espera por ela.

## Variáveis

| Variável | Para quê |
| --- | --- |
| `DATABASE_URL` | PostgreSQL compartilhado (contas, e-mails enviados e o schema `recreio`) |
| `BETTER_AUTH_SECRET` | Segredo das sessões, com 32 caracteres ou mais |
| `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` | Origem do app; em produção, HTTPS e iguais |
| `SENDGRID_API_KEY`, `SENDGRID_FROM` | Envio dos códigos de acesso |
| `EMAIL_SANDBOX_MODE`, `EMAIL_SANDBOX_DIR` | `live`, `sandbox` (arquivos) ou `memory`; produção exige `live` |
| `RECREIO_ACCESS_MODE` | `fechado` (padrão) ou `aberto` |
| `RECREIO_TOKEN_PRIVATE_KEY`, `RECREIO_TOKEN_KEY_ID` | Chave Ed25519 (PKCS8 PEM) dos tokens e o `kid` dela; obrigatórias em produção |
| `RECREIO_TOKEN_PREVIOUS_PUBLIC_KEYS` | JSON de `kid` para chave pública (SPKI PEM) das chaves anteriores, na rotação; padrão `{}` |
| `RECREIO_HOST_SECRETS` | JSON de id do jogo para o segredo da API das instâncias, 32 caracteres ou mais cada |
| `RECREIO_GAME_ORIGINS` | JSON de id do jogo para `{ ws, assets? }`: origens sem caminho, `wss:` e `https:` em produção |
| `CRON_SECRET` | Segredo do agendador para `/api/jobs/*`, 32 caracteres ou mais; obrigatório em produção |
| `REDIS_URL` | Sessões e limites de tentativa; obrigatório em produção |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Erros; obrigatórios e iguais em produção |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Envio dos source maps no build |

A validação fica em `src/lib/environment.ts` e só cita o nome da variável recusada, nunca o valor. Cobrança e preços entram com os próximos lotes. As variáveis novas estão em `turbo.json`; o serviço no Railway e o agendador da manutenção ainda não estão configurados.

## Verificar

```bash
pnpm --filter @informach/recreio-app typecheck
pnpm --filter @informach/recreio-app test              # regras puras, textos, fronteira do acesso, contraste
pnpm --filter @informach/recreio-app test:integration  # banco descartável; ver abaixo
pnpm exec biome check apps/recreio
pnpm build:recreio                                     # precisa das variáveis acima (valores de exemplo servem)
```

`test:integration` roda `scripts/isolated.mjs`: cria um banco `recreio_review_<hex>` no PostgreSQL local apontado por `DATABASE_URL` (ou pelo `.env` da raiz), aplica as migrations, roda `test/*.integration.ts` e apaga o banco. Só aceita servidor em `localhost`, não usa Redis e não envia e-mail. Os testes cobrem:

- perfil único por conta sob concorrência, ids trocados, sessão de aparelho, concessões com a auditoria na mesma transação, o direito de jogar por concessão e por assinatura, e as regras do schema;
- ingresso e sessão de jogo (`jogo.integration.ts`): uso único, prazo, audiência de outro jogo, duas trocas ao mesmo tempo, "continuar aqui", renovação recusada depois de revogar o acesso e o aviso às instâncias só daquele jogo;
- mundos e convites (`mundos.integration.ts`): teto de três mundos sob concorrência, só o responsável convida, código de uso único sob concorrência, vencido, errado, já membro, mundo cheio, limite de tentativas;
- posse e API das instâncias (`posse.integration.ts`): vinte aberturas ao mesmo tempo dão uma posse, renovação contra retomada, o que cada segredo e cada sessão alcançam, retenção das fotografias, manutenção idempotente;
- **a suíte de conformidade do package** (`conformidade.integration.ts`): as mesmas regras que a plataforma em memória passa, contra as rotas do app, com o cliente HTTP de verdade.

As rotas são chamadas dentro do processo (`test/rotas.ts`), sem servidor. As que dependem do cookie do portal (o ingresso) são testadas pelo serviço.

Ainda não há E2E; ele chega com as jornadas de `/jogar`.

## Estrutura

- `src/app`: `/`, `/entrar`, `/comecar`, `/perfis`, `(portal)/estante`, `(portal)/conta`, `(portal)/mundos/[id]`, `(portal)/convite`, `/termos`, `/privacidade` e `api` (auth, health, ready, sair da conta, descadastro de e-mail, `sdk/v1`, `interno/v1`, `jobs/manutencao`).
- `src/features`: `account` (concluir a entrada, botão de sair), `sessao` (ator, sessão de aparelho, saída), `perfis` (criar e escolher), `acesso` (direito de jogar e o texto dele), `estante` (cartões do catálogo), `jogos` (o manifesto e a configuração de cada jogo), `sessao-de-jogo` (ingresso, sessão, renovação), `mundos` (mundos, membros, convites e as telas deles), `posse` (posse, API das instâncias, armazenamento), `manutencao` (rotina agendada), `operations` (prontidão).
- `scripts`: `conceder` e `revogar` (concessões), `gerar-chave` (par de chaves dos tokens), `isolated.mjs` (banco descartável dos testes de integração).
- `test`: testes de integração e o apoio deles.
- `src/components`: marca, capa provisória do Morada, formulário de entrada, moldura das páginas de texto, navegação do portal.
- `src/lib`: auth, env, chaves dos tokens, respostas HTTP, e-mails, Redis, limite de tentativas, logger, observabilidade, telemetria, destino do login.
- `src/proxy.ts`: CSP com nonce.
