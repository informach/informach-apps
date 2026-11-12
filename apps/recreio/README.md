# Recreio

Portal da plataforma de jogos da Informach. Hoje dá para entrar com a conta Informach, criar o perfil, escolher quem joga neste aparelho, ver a estante e a conta com a situação do direito de jogar, criar mundos e chamar outras pessoas por código de convite. O portal também atende os jogos: emite o ingresso e a sessão de jogo (API do SDK), guarda a posse, o diário e as fotografias dos mundos para os servidores de jogo (API das instâncias) e hospeda o jogo em `/jogar/<jogo>?mundo=<id>`. O Morada abre nessa página, com o servidor dele (`apps/morada-server`) rodando ao lado; o jogo de teste, que não existe em produção, serve para provar a plataforma sem jogo nenhum. Regras e limites em [CLAUDE.md](CLAUDE.md); escopo e lotes no [registro da frente](../../docs/recreio/implementacao.md).

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

## Morada no portal

O portal hospeda o cliente do Morada (`@informach/jogo-morada`) em `/jogar/morada?mundo=<id>`; o mundo roda no servidor do jogo (`apps/morada-server`), que fala com o portal pela API das instâncias. Para jogar localmente, com o PostgreSQL no ar e as migrations aplicadas:

1. No `apps/recreio/.env.local`, o segredo e o endereço do servidor do jogo (os valores do `.env.example` já servem; troque o segredo):

   ```bash
   RECREIO_HOST_SECRETS={"morada":"um-segredo-qualquer-com-32-caracteres-ou-mais"}
   RECREIO_GAME_ORIGINS={"morada":{"ws":"ws://localhost:3010"}}
   ```

2. No `apps/morada-server/.env` (copie de `apps/morada-server/.env.example`), o mesmo segredo em `RECREIO_HOST_SECRET`, `RECREIO_API_URL=http://localhost:3009`, `MORADA_PUBLIC_URL=ws://localhost:3010` e `MORADA_ORIGENS=http://localhost:3009`.

3. Em dois terminais, na raiz:

   ```bash
   pnpm dev:recreio          # o portal, na 3009
   pnpm dev:morada-server    # o servidor do jogo, na 3010; registra-se no portal quando ele responde
   ```

4. Crie a conta em `/entrar`, libere-a com `conceder`, crie um mundo em "Seus mundos no Morada" e use "Jogar". Para jogar a dois, crie outra conta em outro navegador (ou janela anônima), libere-a, gere o código de convite na página do mundo e entre com ele pela estante da outra conta.

A ordem em que os dois sobem não importa: o servidor do jogo espera o portal para se registrar, e a página do jogo mostra "O jogo está iniciando" enquanto não há instância. Reiniciar o portal sem `RECREIO_TOKEN_PRIVATE_KEY` troca a chave dos tokens: quem estava jogando precisa abrir o jogo de novo. O que o servidor do jogo registra (posse, fotografias, batimentos com `LOG_LEVEL=debug`) está descrito no [guia dele](../morada-server/README.md#ligado-ao-recreio).

## Jogo de teste

Um contador por mundo, com a lista de quem está presente. Serve para ver a plataforma inteira funcionando (ingresso, sessão, mundo, posse, diário, fotografia, queda e retomada) sem depender de jogo nenhum. **Não existe em produção**: a validação do ambiente recusa a variável num serviço publicado, e um build sem ela nem empacota o cliente.

Para abrir localmente, acrescente ao `.env.local`:

```bash
RECREIO_JOGO_DE_TESTE=1
RECREIO_HOST_SECRETS={"teste":"um-segredo-qualquer-com-32-caracteres-ou-mais"}
RECREIO_GAME_ORIGINS={"teste":{"ws":"ws://localhost:3019"}}
```

(mantendo as entradas dos outros jogos nos dois mapas, se houver) e rode, em dois terminais:

```bash
pnpm dev:recreio                                      # o portal, na 3009
pnpm --filter @informach/recreio-app jogo-de-teste    # a instância do jogo, na porta de RECREIO_GAME_ORIGINS.teste.ws
```

O servidor do jogo (`e2e/servidor/main.ts`) lê o mesmo `.env.local` do portal. Com a conta liberada (`conceder`), a estante ganha a seção "Seus mundos no Jogo de teste": crie um mundo e use "Jogar". Reiniciar o portal sem `RECREIO_TOKEN_PRIVATE_KEY` troca a chave dos tokens: quem estava jogando precisa abrir o jogo de novo.

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
| `RECREIO_JOGO_DE_TESTE` | `1` liga o jogo de teste (`teste`). Só em desenvolvimento e na verificação isolada; recusada em produção |
| `REDIS_URL` | Sessões e limites de tentativa; obrigatório em produção |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Erros; obrigatórios e iguais em produção |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Envio dos source maps no build |

A validação fica em `src/lib/environment.ts` e só cita o nome da variável recusada, nunca o valor. Cobrança e preços entram com os próximos lotes. As variáveis novas estão em `turbo.json`; o serviço no Railway e o agendador da manutenção ainda não estão configurados.

## Verificar

```bash
pnpm --filter @informach/recreio-app typecheck
pnpm --filter @informach/recreio-app test              # regras puras, textos, fronteira do acesso, contraste
pnpm --filter @informach/recreio-app test:integration  # banco descartável; ver abaixo
pnpm --filter @informach/recreio-app e2e               # navegador, portal e os servidores do jogo de teste e do Morada; ver abaixo
pnpm exec biome check apps/recreio
pnpm build:recreio                                     # precisa das variáveis acima (valores de exemplo servem)
```

`test:integration` roda `scripts/isolated.mjs`: cria um banco `recreio_review_<hex>` no PostgreSQL local apontado por `DATABASE_URL` (ou pelo `.env` da raiz), aplica as migrations, roda `test/*.integration.ts` e apaga o banco. Só aceita servidor em `localhost`, não usa Redis e não envia e-mail. Os testes cobrem:

- perfil único por conta sob concorrência, ids trocados, sessão de aparelho, concessões com a auditoria na mesma transação, o direito de jogar por concessão e por assinatura, e as regras do schema;
- ingresso e sessão de jogo (`jogo.integration.ts`): uso único, prazo, audiência de outro jogo, duas trocas ao mesmo tempo, "continuar aqui", renovação recusada depois de revogar o acesso e o aviso às instâncias só daquele jogo;
- mundos e convites (`mundos.integration.ts`): teto de três mundos sob concorrência, só o responsável convida, código de uso único sob concorrência, vencido, errado, já membro, mundo cheio, limite de tentativas;
- posse e API das instâncias (`posse.integration.ts`): vinte aberturas ao mesmo tempo dão uma posse, renovação contra retomada, o que cada segredo e cada sessão alcançam, retenção das fotografias, manutenção idempotente;
- **a suíte de conformidade do package** (`conformidade.integration.ts`): as mesmas regras que a plataforma em memória passa, contra as rotas do app, com o cliente HTTP de verdade.

- a página do jogo (`jogar.integration.ts` e `jogar-pagina.integration.ts`): com o jogo de teste desligado ele não existe para ninguém; com um jogo que o portal hospeda, o que a página decide no servidor (404, estante, mundo indisponível, pronto) e o que ela entrega ao navegador.

As rotas são chamadas dentro do processo (`test/rotas.ts`), sem servidor. As que dependem do cookie do portal (o ingresso) são testadas pelo serviço e pelo E2E.

### E2E

`pnpm --filter @informach/recreio-app e2e` roda `scripts/isolated.mjs e2e`: cria o banco descartável, aplica as migrations, faz um **build de produção** com o jogo de teste ligado (em `.next-isolated-<id>`, sem tocar no `.next`), sobe o portal com `next start` na porta 3109 e roda o Playwright (`e2e/*.spec.ts`, Chromium com desenho por software). Os servidores dos jogos são processos à parte, iniciados e derrubados pelos próprios testes: o do jogo de teste (porta 3019) e o do Morada, o de verdade (`apps/morada-server`, porta 3110, com `MORADA_PLATAFORMA=recreio` e `MORADA_REGRAS=prova`). Precisa só do PostgreSQL local e do Chromium do Playwright (`pnpm --filter @informach/recreio-app exec playwright install chromium`); não usa Redis, não envia e-mail (os códigos ficam em arquivos) e gera os segredos na hora. As portas mudam com `RECREIO_E2E_PORT`, `RECREIO_E2E_GAME_PORT` e `RECREIO_E2E_MORADA_PORT`.

`e2e/morada.spec.ts` é a condição de saída da etapa 1 ("duas contas diferentes jogam a mesma família, uma cai, a outra continua, e tudo volta depois de derrubar a instância"), pelo portal, pela API do Recreio, pelo banco e pelo servidor do Morada de verdade:

- duas contas se cadastram, uma cria o mundo do Morada e convida, a outra entra; as duas abrem `/jogar/morada` e veem a mesma família, os quatro retratos e o mesmo relógio; quem criou é responsável com todas as permissões, quem foi convidada joga sem gerir o mundo nem as finanças;
- cada uma dirige um morador e vê o da outra como "Dirigido por <apelido>"; tomar o morador da outra é recusado com a mensagem; uma manda o morador a um ponto do chão e a outra o vê chegar lá; o menu em leque de um móvel põe uma interação na fila; a janela muda de tamanho e a cena e o HUD acompanham;
- o navegador de uma delas é **morto** (o processo, sem aviso): a outra continua, vê "em espera" e, passados os 30 s, assume o morador;
- depois de uma fotografia do mundo, um fato que só fica no diário (o morador preferido) e então a instância é **morta com `SIGKILL`**: quem joga vê a faixa de reconexão do jogo, não uma página de erro; outra instância sobe, assume quando a posse vence, e o mundo volta com a mesma família, o preferido de pé, a reserva retomada por ele e o relógio sem voltar. O registro das instâncias mostra as cercas 1 e 2 e a segunda abertura montada da fotografia mais o diário;
- a conta que caiu entra de novo em outro navegador, responde "Continuar aqui" e está na mesma família;
- sem instância, a página diz "O jogo está iniciando"; a mesma conta em outra aba e a saída da conta encerram o jogo com **um** aviso, o da página;
- a estante não baixa o código do jogo (nem a marca do cliente, nem o three.js) e a página do jogo baixa; nenhuma violação da política de segurança, erro de página ou erro de console; nenhum segredo ou token no que a instância escreveu.

O jogo é montado como em produção, sem a opção de depuração: o teste confere o HUD, os nomes acessíveis e os atributos `data-morada-*`, e descobre onde clicar na cena passando o ponteiro por ela.

O que `e2e/jogar.spec.ts` prova, com o jogo de teste:

- recusas: sem o direito de jogar a página devolve para a estante; jogo que não existe é 404; mundo de outra pessoa, de outro jogo, inexistente ou com id sem forma mostram o mesmo aviso;
- sem nenhuma instância, a pessoa lê "O jogo está iniciando" e "Tentar de novo" abre o jogo quando a instância sobe;
- a estante não baixa o código do jogo e a página do jogo baixa (pelo texto dos scripts que cada navegação recebeu), e cada uma chega com a sua política de segurança;
- duas contas no mesmo mundo veem uma à outra e ao contador; um aparelho some e a outra pessoa continua; sair pela página grava a fotografia e voltar traz o mesmo valor;
- a instância é derrubada com `SIGKILL`: aparece "Reconectando…", outra instância sobe, assume quando a posse vence e o contador é o mesmo (fotografia mais o que só estava no diário);
- o mesmo perfil numa segunda aba vê "Você já está jogando em outro lugar"; "Continuar aqui" encerra a primeira, com a explicação; sair da conta numa aba encerra o jogo na outra pelo batimento;
- **nenhuma violação da política de segurança** em nenhuma página, durante todos os testes (o `afterEach` falha se houver).

Uma falha deixa traces e capturas em `tmp/verification/<id>`; as capturas das telas do jogo ficam em `tmp/telas`.

## Estrutura

- `src/app`: `/`, `/entrar`, `/comecar`, `/perfis`, `(portal)/estante`, `(portal)/conta`, `(portal)/mundos/[id]`, `(portal)/convite`, `jogar/[jogo]`, `/termos`, `/privacidade` e `api` (auth, health, ready, sair da conta, descadastro de e-mail, `sdk/v1`, `interno/v1`, `jobs/manutencao`).
- `src/features`: `account` (concluir a entrada, botão de sair), `sessao` (ator, sessão de aparelho, saída), `perfis` (criar e escolher), `acesso` (direito de jogar e o texto dele), `estante` (cartões do catálogo), `jogos` (o catálogo do deploy e a configuração de cada jogo), `jogar` (a página que hospeda o jogo: decisão no servidor, estados, registro e carregadores dos clientes, e `adaptadores/` com o do Morada), `jogo-de-teste` (cliente e protocolo do jogo de teste), `sessao-de-jogo` (ingresso, sessão, renovação), `mundos` (mundos, membros, convites e as telas deles), `posse` (posse, API das instâncias, armazenamento), `manutencao` (rotina agendada), `operations` (prontidão).
- `scripts`: `conceder` e `revogar` (concessões), `gerar-chave` (par de chaves dos tokens), `isolated.mjs` (banco descartável dos testes de integração e do E2E).
- `test`: testes de integração e o apoio deles.
- `e2e`: `jogar.spec.ts` (a plataforma, com o jogo de teste), `morada.spec.ts` (o Morada de verdade), `apoio.ts` e `morada-apoio.ts` (o que os dois têm em comum e o que é do Morada), `navegador.ts` (opções do Chromium) e `servidor/main.ts` (o servidor do jogo de teste).
- `src/components`: marca, capa provisória do Morada, formulário de entrada, moldura das páginas de texto, navegação do portal.
- `src/lib`: auth, env, chaves dos tokens, respostas HTTP, e-mails, Redis, limite de tentativas, logger, observabilidade, telemetria, destino do login.
- `src/proxy.ts`: CSP com nonce (a de `/jogar/<jogo>` leva as origens do jogo), montada em `src/lib/csp.ts`.
