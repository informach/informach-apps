# Recreio e Morada: registro da implementação

Registro detalhado da frente. O índice de continuidade é o [estado do repositório](../estado-do-repositorio.md); as regras permanentes ficam no [AGENTS.md](../../AGENTS.md).

Branch `feat/recreio`, em worktree próprio. Nada foi enviado ao remoto nem publicado.

## De onde vem o escopo

As propostas ficam no repositório privado `informach/artes-3d`: `paginas/recreio.html` (v2.2), `paginas/morada.html` (v4.4, embora o rodapé da página ainda diga v4.2) e `CONTINUAR.md`. A seção "Ordem" das duas define 5 etapas. Esta frente cobre as duas primeiras, por decisão do titular em 11/11/2026:

- **Etapa 1, "Prova juntos"**: mínimo do Recreio (login, perfil, ingresso, mundo com membros de duas contas, posse da instância) mais a Fase 0 do Morada. Sai quando "duas contas diferentes jogam a mesma família, uma cai, a outra continua, e tudo volta depois de derrubar a instância", com o custo por hora de mundo medido.
- **Etapa 2, "A diversão"**: Fases 1 e 2 do Morada jogando sozinho; o Recreio só corrige. Sai quando "uma pessoa joga 7 dias de jogo e quer continuar; o filho nasce e cresce sendo a mesma pessoa".

As etapas 3 a 5 ficam fora.

## Onde cada coisa fica

| Onde | Papel |
| --- | --- |
| `apps/recreio` (porta 3009) | Portal Next.js: login por OTP, perfis, estante, mundos, convites, `/jogar/[jogo]`, API do SDK, API das instâncias, job de manutenção. Único que grava no schema `recreio` |
| `packages/recreio` | Domínio puro e contratos, sem banco. Guia em [`packages/recreio/README.md`](../../packages/recreio/README.md) |
| `packages/morada-sim` | Simulação determinística em TypeScript puro |
| `apps/morada-server` | Processo Node com vários mundos por instância, WebSocket. Fala com o Recreio só pela API das instâncias |
| `packages/jogo-morada` | Cliente do jogo: three.js para a cena, React no HUD, carregado sob demanda por `/jogar/morada` |
| `packages/morada-arte` | Empacotador (só código). Lê a arte de um clone do `artes-3d` fora deste repositório |
| `packages/config` | `APPS.recreio`, produtos `price_TODO_recreio_*`, `jogos.ts` |
| `packages/db` | Schema `recreio`. O schema `morada` não é criado nestas etapas |

## Decisões

Fecham o que as propostas deixaram em aberto. Mudam só com registro aqui.

1. **Posse e cerca no Postgres**, não no Redis: contador por mundo, conferido na mesma transação da escrita, com índice único "uma posse aberta por mundo". Só assim "instância velha não grava" é atômico.
2. **Fotografias e diário no Postgres**, atrás de uma porta de armazenamento, com teto de tamanho e piso de 5 fotografias. As colunas para um bucket do Railway já ficam prontas.
3. **Recuperação = última fotografia + fatos do diário**, aplicados pelo mesmo redutor que a simulação usa ao vivo. Cada fato crítico tem id determinístico (o nascimento é `nasc:<gravidezId>`).
4. **Determinismo imposto** na simulação: tempo em ticks inteiros, sorteio por contador, aritmética inteira; `tsconfig` sem DOM nem Node, regra do Biome e teste que varre o código.
5. **Tokens** em JWS Ed25519 com `jose`: ingresso de 60 s e uso único, sessão de jogo de 15 min. Chaves públicas em `/api/sdk/v1/jwks`; `jti` consumido no Postgres.
6. **Direito de jogar na etapa 1 por concessão auditada**, porque a cobrança só entra no Marco 2. `decidirAcesso` é a única função que decide; `past_due` não joga.
7. **Sem arte, tudo roda**: corpos e móveis procedurais atrás da mesma interface dos pacotes. CI e E2E nunca usam arte licenciada.
8. **Tabelas em inglês**, como todo o `packages/db`; textos, URLs e API do SDK em português.
9. **Uma constante `RECREIO_LAUNCHED = false`** no `.railway/railway.ts` segura os dois serviços e o cron.
10. **O servidor do jogo fala com o Recreio por HTTP**, nunca pelas tabelas. O empacotador de arte fica neste repositório como código, e não no `artes-3d`, para o contrato do manifesto e o empacotador andarem na mesma versão.
11. **O app se chama `@informach/recreio-app`** no workspace, porque `@informach/recreio` é o package de domínio e contratos, como a proposta prescreve. Os scripts da raiz seguem o padrão curto (`dev:recreio`, `build:recreio`, `start:recreio`).

## Suposições adotadas

Valem até o titular dizer o contrário.

1. A prova usa uma família pronta de quatro moradores e dois NPCs avulsos; a criação de personagem entra na etapa 2.
2. Regras de tempo da prova num preset comprimido (gravidez e fases curtas), configurável por mundo.
3. Quem entra na família compartilhada recebe as permissões de jogo, menos "gerir o mundo" e "gerir finanças".
4. Queda de conexão: 30 s de tolerância antes de liberar a reserva. Queda da instância: até 30 s para outra assumir.
5. Exclusão de conta no Recreio já ativa, deixando o mundo para os outros membros.
6. Testadores da etapa 1 são adultos da equipe, com concessão de 30 dias.

## Lotes

Estado: `feito` (implementado e verificado localmente), `em curso`, `a fazer`.

### Etapa 1, plataforma

| Lote | Entrega | Estado |
| --- | --- | --- |
| P0 | `packages/recreio` (`.`, `./contrato`, `./emissor`, `./host`, `./testing`), `packages/config/src/jogos.ts` | feito |
| P1 | Esqueleto do `apps/recreio` e registros no monorepo | feito |
| P2 | Schema `recreio`, migração, grupos, perfis, sessão de aparelho | feito |
| P3 | Carregador de acesso, concessões, scripts `conceder` e `revogar` | feito |
| P4 | Ingresso, sessão, renovação, JWKS, cliente do SDK | feito |
| P5 | Mundos, membros, convite | feito |
| P6 | Posse, API das instâncias, armazenamento | feito |
| P7 | `/jogar/[jogo]`, jogo de teste, E2E com queda da instância | feito |

### Etapa 1, jogo

| Lote | Entrega | Estado |
| --- | --- | --- |
| J0 | Modelo: ids, tipos, formatos, invariantes | feito |
| J1 | Núcleo determinístico: relógio, sorteio, comandos, fatos, fotografia | feito |
| J2 | Conteúdo, casa da prova, navegação, necessidades, autonomia | feito |
| J3 | Relações, casamento, gravidez, nascimento, cuidado, fases, políticas de tempo | feito |
| J4 | Sessões, reserva de controle, permissões, visão e mudanças | feito |
| J5 | Persistência e recuperação contra a plataforma falsa | feito |
| J6 | `apps/morada-server` | feito |
| J7 | Quedas injetadas e gerador de carga | feito |
| J8 | Cliente com cena procedural e HUD | feito |

### Etapa 1, junção

| Lote | Entrega | Estado |
| --- | --- | --- |
| X1 | Plataforma real no servidor, `/jogar/morada`, E2E com duas contas | em curso |
| X2 | Empacotador e corpos reais na máquina de desenvolvimento | a fazer |
| X3 | Railway atrás da constante, Bastidores mínimo, guias | a fazer |
| X4 | Deploy fechado e medição de custo, só com autorização | a fazer |

### Etapa 2

| Lote | Entrega | Estado |
| --- | --- | --- |
| D1 | Arte completa no jogo e metas de desempenho | a fazer |
| D2 | Criar família | a fazer |
| D3 | Construir e comprar | a fazer |
| D4 | 20 a 30 interações com animação real | a fazer |
| D5 | Família completa | a fazer |
| D6 | Ciclo do mundo no portal | a fazer |
| D7 | Som | a fazer |
| D8 | Teste de jogo e medição | a fazer |

## Verificações executadas

### P0 (11/11/2026)

- `pnpm --filter @informach/recreio typecheck` e `pnpm --filter @informach/config typecheck`: sem erros.
- `pnpm --filter @informach/recreio test`: 70 testes em 4 arquivos. Cobrem a tabela de estados de `decidirAcesso`, o código de convite, a sucessão do responsável, a emissão e a conferência dos tokens (vencido, outro jogo, outro emissor, adulterado, chave desconhecida, claims a mais, ingresso no lugar de sessão) e a conformidade da API das instâncias contra a plataforma em memória.
- `pnpm exec biome check packages/recreio packages/config`: limpo.

A suíte de conformidade (`@informach/recreio/testing/conformidade`) é a mesma que a implementação real da API das instâncias terá de passar no lote P6.

### P1 (11/11/2026)

- `pnpm --filter @informach/recreio-app typecheck`: sem erros. `pnpm --filter @informach/recreio-app test`: 51 testes em 5 arquivos (ambiente, destino seguro, telemetria, catálogo da estante, contraste do tema). `pnpm exec biome check apps/recreio packages/config package.json turbo.json`: limpo.
- `pnpm build:recreio` com as variáveis do CI: build concluído, com as rotas `/`, `/entrar`, `/estante`, `/conta`, `/termos`, `/privacidade`, `/api/auth/[...all]`, `/api/health`, `/api/ready` e `/api/email/unsubscribe`.
- Consumidores do `packages/config` (`config`, `admin`, `billing`, `informach-site`): typecheck limpo; testes de `config` (3), `admin` (180) e `billing` (205) passaram. Nenhum deles precisou de ajuste.
- App rodando na porta 3009 contra um Postgres descartável, com e-mail em sandbox: cadastro, confirmação por código, entrada por OTP, código errado recusado, `/estante` e `/conta` protegidas, saída, 404 próprio e CSP sem erro de console, por HTTP e em navegador (Chromium).
- **Não exercitado**: sessões no Redis (prefixo `recreio:auth:`) e `/api/ready` respondendo 200, porque não havia Redis na máquina; envio real pelo SendGrid; o bundle de produção servido por `next start`.

### J5 a J7: servidor do jogo (11/11/2026)

- `pnpm --filter @informach/morada-server typecheck`: sem erros. `pnpm exec biome check apps/morada-server`: limpo. `pnpm --filter @informach/morada-server test`: 45 testes em 5 arquivos, três execuções seguidas sem falha. O que cada arquivo prova está no [guia do servidor](../../apps/morada-server/README.md).
- Os cinco passos do teste decisivo e a condição de saída da etapa passam **com o servidor, contra a plataforma em memória**: duas contas entram no mesmo mundo e na mesma instância e dirigem moradores da mesma família; uma cai sem aviso e a outra continua, com a fila intacta; a instância é derrubada, outra assume quando a posse vence e o mundo volta com o que é crítico exatamente igual. Falta repetir contra o Recreio de verdade, com banco e processo morto por sinal (lote X1).
- Parto uma vez só nos três pontos de queda (antes de o fato ir para o diário, depois, e depois de avisar os clientes): em todos, depois da retomada há um bebê, com o id decidido na concepção, e uma entrada `nasc:<gravidez>` no diário.
- Instância congelada além do prazo: ao voltar não simula nem escreve, fica sabendo no batimento seguinte, larga o mundo e fecha as conexões. O diário não recebe nada dela depois que outra assumiu.
- Com o Recreio fora do ar, um passo com fato não é respondido nem difundido e o mundo não avança; quando volta, o fato entra uma vez só.
- Quatro testes sobem o servidor em uma porta de verdade, com clientes WebSocket de verdade: origem e subprotocolo conferidos na subida, quadro grande demais, conexão que some sem fechar, saúde, prontidão, medidas e desligamento ordenado.
- O ponto de entrada foi exercitado no modo de desenvolvimento (plataforma em memória): `/api/health`, `/api/ready` e `/dev/entrar` responderam. O modo ligado ao Recreio de verdade compila e ainda não foi executado.

Medida de bancada (`pnpm --filter @informach/morada-server carga 10 5`: 10 mundos, 5 minutos de jogo cada, tudo no mesmo processo, sem rede nem banco, com os robôs clientes gastando CPU junto):

| Jogadores por mundo | CPU por hora de mundo | CPU por passo | Tráfego por mundo | Memória por mundo | Fotografia |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 5,5 s | 0,153 ms | 1,2 kB/s | 610 kB | 4,8 kB |
| 2 | 4,4 s | 0,122 ms | 2,5 kB/s | 512 kB | 5,3 kB |
| 4 | 1,7 s | 0,048 ms | 6,1 kB/s | 669 kB | 6,0 kB |
| 8 | 2,3 s | 0,065 ms | 12,2 kB/s | 1.063 kB | 7,2 kB |

A ordem dos cenários pesa (o primeiro paga o aquecimento do motor), então a tabela serve para ordem de grandeza: poucos segundos de CPU por hora de mundo, cerca de 1,5 kB/s por jogador, menos de 1 MB de memória e fotografias de poucos kB. **Não é o custo por hora de mundo do Marco 0**, que só sai do Railway, com rede, banco e o processo de verdade (lote X4).

Decisões tomadas ao implementar:

- Dentro do mundo um jogador é o **id de membro**, não o id do perfil. O conteúdo do mundo nunca guarda o perfil do Recreio; apagar um perfil vira anular um vínculo no Recreio, sem reescrever diário.
- A sessão dentro da simulação é a própria sessão de jogo. Reconectar com a mesma sessão retoma a reserva; uma sessão nova do mesmo jogador toma o lugar da antiga.
- O prazo local da posse conta da hora em que o último batimento foi **enviado**, e o ator para 3 s antes dele. Não se compara relógio da instância com relógio do Recreio.
- Fotografia a cada 30 s de mudança e logo depois de nascimento, casamento, mudança de família ou de fase. Um mundo que abre sem fotografia nasce de novo do mesmo jeito (a semente vem do id) e reaplica o diário.
- Fotografia e hibernação que falham por indisponibilidade do Recreio não derrubam o mundo: repetem em 5 s. Achado por um teste.
- O acesso de quem entra é um fato, gravado antes de a pessoa ver o mundo: o responsável recebe todos os direitos sobre as famílias; o convidado, os de jogo sobre a família indicada no convite.

O que o servidor ainda não tem: build de produção, serviço no Railway, Sentry e a rota de arte (lotes X2 e X3).

### P2 e P3 (11/11/2026)

- Migração `0080_recreio` gerada pelo Drizzle, sem edição à mão, com o schema inteiro da etapa 1 (14 tabelas e a sequência `game_session_end_seq`). Um segundo `pnpm db:generate` não propõe mudança. **Ainda não aplicada em nenhum banco além dos descartáveis de teste.**
- `pnpm --filter @informach/recreio-app typecheck`: sem erros. `test`: 74 testes em 9 arquivos. `test:integration`: 45 testes em 3 arquivos, contra um banco descartável criado, migrado e apagado pela execução (Postgres embutido do repositório, sem Redis). `pnpm exec biome check apps/recreio packages/db packages/auth`: limpo. `pnpm build:recreio` com as variáveis do CI: concluído.
- Typecheck de `db`, `auth`, `admin`, `dia-de-estrela`, `bora-treinar`, `billing`, `emails`, `missao-saber`, `cozya`, `agenda-da-turma`, `edi` e `edi-licensing`: limpo. Testes unitários de `auth` (261), `admin` (180), `dia-de-estrela` (87), `bora-treinar` (246), `billing` (205) e `db` (18) passaram.
- A integração cobre: um perfil por conta sob concorrência; id de outra conta recusado como "não encontrado", igual a um perfil que não existe; perfil ativo que deixa de valer é descartado; concessão dá `ATIVO` com o limite do plano, vencida dá `ENCERRADO`, revogada dá `REVOGADO`; segunda concessão viva recusada; concessão e evento de auditoria gravam ou falham juntos; apagar uma conta deixa o mundo, o membro (com perfil nulo), a posse, a fotografia e o diário; os índices únicos recusam a segunda sessão de jogo aberta por perfil e a segunda posse aberta por mundo.
- Jornada em navegador (Chromium, banco descartável): cadastro, código, `/comecar`, barreira do modo fechado, concessão, `/conta`, `/perfis`, revogação, saída, saída de outra origem recusada.
- **Não exercitado**: sessões no Redis; o bundle de produção servido por `next start`; o Postgres 16 do CI (o embutido é 18.4); as suítes inteiras do repositório (`pnpm check`, `pnpm test`).

O que estes lotes fixam para os próximos:

- Encerrar uma sessão de jogo grava `ended_at`, `end_reason` e `ended_seq` no mesmo comando; a sequência é entregue antes do commit, então quem lê o cursor precisa serializar os encerramentos ou ler com folga (P4 e P6).
- Sair por outro caminho que não `/api/conta/sair` (expiração, revogação pelo Bastidores) não marca `revoked_at`: a linha só fica inalcançável. A renovação da sessão de jogo tem de passar por `atorAtual()`.
- Ordem de trava: criação de perfil e concessão travam primeiro a linha da conta em `core.users`. Mundos e posse seguem a mesma ordem.
- Um id de conta é um UUID válido e passa no esquema de `PerfilId`; a separação é imposta pelos tipos com marca e, em execução, pela consulta, que não encontra o perfil.
- No Bastidores os eventos `recreio.*` aparecem com o texto genérico até o lote X3.
- `/privacidade` e a linha da página inicial foram atualizadas para dizer que o Recreio guarda perfis; continuam pedindo a revisão do titular.

### P4 a P6: tokens, mundos e posse (11/11/2026)

- `pnpm --filter @informach/recreio typecheck`, `pnpm --filter @informach/recreio-app typecheck`, `pnpm --filter @informach/auth typecheck` e `pnpm --filter @informach/db typecheck`: sem erros. `pnpm exec biome check apps/recreio packages/recreio packages/auth packages/db`: limpo.
- `pnpm --filter @informach/recreio test`: 105 testes em 6 arquivos (entram o cliente do SDK e o cliente das instâncias). `pnpm --filter @informach/recreio-app test`: 103 testes em 10 arquivos. `pnpm --filter @informach/auth test`: 268 testes.
- `pnpm --filter @informach/recreio-app test:integration`, contra um Postgres descartável com todas as migrações: 132 testes em 7 arquivos (acesso 17, perfis 18, schema 10, conformidade 29, jogo 22, mundos 17, posse 19).
- **A suíte de conformidade da API das instâncias passa sem alteração contra a implementação de verdade**: os 29 casos rodam pelo `criarClienteDoHost` real, com o `fetch` entregue aos manipuladores de rota exportados e o banco de verdade por baixo. É a mesma suíte que a plataforma em memória passa.
- `pnpm build:recreio` com as variáveis do CI e uma chave descartável: build concluído, com as rotas `/api/sdk/v1/*`, `/api/interno/v1/*`, `/api/jobs/manutencao`, `/mundos/[id]` e `/convite`.
- Passagem manual por HTTP de verdade (`next dev` na 3009, banco descartável, Chromium no portal, `criarRecreio` e `criarClienteDoHost` pela rede): duas contas, mundo criado no portal, convite aceito pela outra conta e código reusado recusado; ingresso só com cookie e da própria origem; sessão conferida contra o JWKS remoto; `SEM_INSTANCIA` sem instância; registro recusado com segredo errado; reivindicar, entrada dos dois, diário com buraco recusado, fotografia de 200 kB lida de volta byte a byte, batimento com as sessões encerradas, liberar com `CHECKPOINT_PENDENTE` e depois com sucesso, cerca velha recusada com `POSSE_PERDIDA`, manutenção registrada em `ops.job_runs`.
- **Não exercitado**: Redis (sessões e limite de tentativas no Redis só têm teste com armazenamento em memória); `next start` no bundle de produção; Postgres 16 (o embutido é o 18); a mudança do `ci.yml` rodando no GitHub; `pnpm check` e `pnpm test` do repositório inteiro.

Decisões tomadas nestes lotes:

- O direito de jogar é avaliado imediatamente antes de cada transação, não dentro dela: `avaliarAcesso` usa o pool, e pedir uma segunda conexão com a transação aberta trava o app quando o pool enche (o teste de 20 aberturas simultâneas ficaria parado).
- Os prazos de posse são julgados com `clock_timestamp()`, não `now()`: quem esperou a trava do mundo é julgado pela hora em que a conseguiu.
- O batimento não trava a linha do mundo. Ele renova a posse com um comando condicionado, e a retomada fecha a mesma linha com a condição oposta: entre as duas, exatamente uma acontece.
- `JA_ABERTO` desfaz a transação e o ingresso não é gasto; a página pergunta e tenta de novo com `continuarAqui`.
- Uma instância só se registra com o endereço de `RECREIO_GAME_ORIGINS[jogo].ws`. Como o endereço é um por jogo, vale a restrição de uma réplica do servidor do jogo.
- O CI não guarda chave: um passo gera um par descartável (`apps/recreio/scripts/gerar-chave.mjs --github-env`) antes do `pnpm build`.
- `@informach/auth/sessions` ganhou `isAuthSessionLive`, para conferir a sessão de login sem cookie (Redis do app quando existe, senão `core.sessions`). É aditivo.
- O Recreio não avisa a instância de uma atribuição: o navegador recebe o endereço, conecta, e a instância reivindica. Posse atribuída e não reivindicada vence em 30 s.
- Uma fotografia compacta o diário. Na recuperação, a instância lê a fotografia e depois o diário a partir de `fotografia.diarioSeq`.

Lacunas conhecidas, aceitas nesta etapa: a leitura do diário não é paginada; a emissão de ingresso não tem limite de tentativas; a renovação não recusa quando o jogo entra em `manutencao`; a entrada no mundo não reavalia o direito de jogar (a renovação da sessão e o batimento cobrem); nenhum serviço, variável ou agendador no `.railway/railway.ts` (lote X3).

### P7: página do jogo, jogo de teste e ponta a ponta (12/11/2026)

- `pnpm --filter @informach/recreio-app typecheck` e `pnpm --filter @informach/recreio typecheck`: sem erros. `pnpm exec biome check apps/recreio packages/recreio`: limpo. `pnpm --filter @informach/recreio-app test`: 162 testes em 14 arquivos. `pnpm --filter @informach/recreio test`: 105 testes.
- `pnpm --filter @informach/recreio-app test:integration`: 143 testes em 9 arquivos (os 132 de antes e 11 novos, da página do jogo com a variável do jogo de teste desligada e ligada).
- `pnpm --filter @informach/recreio-app e2e`: 3 testes de navegador contra o portal em build de produção (`next build` e `next start`), banco descartável e o servidor do jogo de teste como processo à parte, sem nenhum código do Morada. Cerca de 2 minutos e meio com migrações e build.
  - Duas contas se cadastram, confirmam o e-mail, criam perfil e recebem a concessão; uma cria o mundo e gera o convite, a outra entra pelo código; as duas abrem `/jogar/teste`, veem uma à outra e as somas uma da outra.
  - A janela de uma é fechada: ela sai da lista da outra, que continua somando.
  - **A instância é morta sem aviso** (`SIGKILL`): a página mostra "Reconectando", outro processo sobe e, quando a posse vence, o jogo volta **com o mesmo valor** e continua. O registro da instância é conferido: cercas 1, 2 e 3, e a última abertura veio da fotografia mais o diário.
  - Um perfil joga em um lugar por vez: a segunda aba mostra "Você já está jogando em outro lugar", e "Continuar aqui" encerra a primeira. Sair da conta em uma aba encerra o jogo na outra dentro do batimento.
  - Recusas: sem o direito de jogar volta para a estante; mundo de outra pessoa, mundo que não existe e id malformado mostram o mesmo aviso; `/jogar/nao-existe` é 404; sem instância aparece "O jogo está iniciando" e "Tentar de novo" funciona quando ela sobe.
  - Nenhuma violação da política de segurança em nenhuma página, e o código do jogo de teste não aparece em nenhum script de `/estante`.
- `pnpm build:recreio` com as variáveis do CI: `/jogar/[jogo]` listada, e nenhum arquivo do build contém o cliente do jogo de teste.
- **Uma falha sem explicação em sete execuções do E2E, na máquina de desenvolvimento**: o processo do portal deixou de responder no começo de uma execução, sem saída guardada. Não se repetiu em cinco execuções seguintes; a saída do portal agora é guardada.
- **Não exercitado**: repasse da sessão renovada e a perda de acesso durante o jogo (pedem uns 10 minutos de jogo); Redis; o passo novo do `ci.yml` rodando no GitHub; `next start` do build de produção com a variável desligada pedindo `/jogar/teste` (a garantia é o build sem o cliente, a validação do ambiente e os testes de integração com a variável desligada).

Decisões tomadas neste lote:

- **Contrato entre a página e o cliente de um jogo**: `ModuloDoJogo` em `@informach/recreio/sdk` (`montar(host, contexto, { mundoId, aoSair, aoFalhar })` devolve `{ dispose() }`). Fica em módulo só de navegador; `./contrato` não cita tipo de DOM, porque o servidor do jogo o importa.
- **O registro dos clientes** (`apps/recreio/src/features/jogar/registro.ts`) liga o id do jogo a um `import()` dinâmico. Jogo do catálogo sem linha no registro não tem página.
- **Jogo de teste** (`teste`): existe só com `RECREIO_JOGO_DE_TESTE=1`, recusada em serviço publicado e em `NODE_ENV=production` fora da verificação isolada em `localhost`. O cliente dele nem entra no build quando a variável está desligada. O catálogo público (`@informach/config/jogos`) não o conhece.
- **A política de segurança de `/jogar/<jogo>`** é a do portal mais o que um jogo em WebGL com WebSocket precisa: `'wasm-unsafe-eval'`, `worker-src 'self' blob:`, imagens e mídia em `blob:` e `connect-src` com a origem do WebSocket daquele jogo. As outras rotas ficam como estavam.
- **Entrar e sair da página do jogo é sempre carga de documento**, nunca navegação do roteador do Next: a política é do documento.
- **Uma sessão de jogo por perfil**: tudo o que tira o jogo da tela desmonta o jogo e chama `sair()` antes de qualquer nova tentativa.
- O Zod, no navegador, sonda `new Function` e isso aparece como violação da política; componente de navegador que usa o SDK importa `lib/zod-sem-eval.ts` antes.

Para saber: sessão que acaba sem `pagehide` (navegador que trava) fica aberta até vencer, e a próxima abertura no mesmo aparelho mostra "Você já está jogando em outro lugar". Uma instância morta continua elegível por até 30 s, e um mundo aberto nessa janela espera a posse não reivindicada vencer.

### J8: cliente do jogo (12/11/2026)

- `pnpm --filter @informach/jogo-morada typecheck`: sem erros. `pnpm exec biome check packages/jogo-morada`: limpo. `pnpm --filter @informach/jogo-morada test`: 71 testes em 6 arquivos, com a simulação de verdade como referência (estados da conexão e reabertura por código de fechamento, buraco de sequência, estimador do tick do servidor, espelho igual a `mundo.visao()` depois de um roteiro de duas pessoas, comando pendente reenviado com o mesmo id, rota prevista igual à do servidor, menu em leque, retratos de duas pessoas, mapa de eixos sem espelhar a casa).
- `pnpm --filter @informach/jogo-morada e2e`: 15 testes em Chromium (desenho por software), com o servidor do jogo em modo de desenvolvimento e a bancada construída. Duas pessoas entram no mesmo mundo e veem os quatro retratos; cada uma dirige um morador e tomar o do outro é recusado; clicar no chão leva o morador e a outra pessoa vê chegar; o menu da geladeira manda fazer um lanche; a rede cai e o jogo reconecta com a mesma sessão; uma pessoa some sem aviso, a outra continua, vê a espera, e depois de 30 s assume o morador; o contexto WebGL se perde e volta; teclado; janela de 900 px; sair; outra janela com o mesmo apelido toma o lugar. Nenhum erro no console.
- O bundle é conferido no mesmo teste: o JavaScript do jogo tem 1.019 kB (278 kB com gzip) em 4 arquivos, dentro do orçamento de 1.250 kB e 360 kB; a página que importa só `MARCA_DO_CLIENTE` baixa 2,8 kB e nenhum three.js.
- Roteiro de vida por script, uma pessoa a 3×, regras da prova (cerca de 33 minutos, sem erro de página): visita da vizinha, namoro, casamento, a vizinha vem morar na casa e aparece o quinto retrato, gravidez, nascimento com o bebê no colo e o sexto retrato, menu de cuidado do bebê e mamadeira na fila.
- Medido na máquina de desenvolvimento (1280×720, casa da prova, 54 objetos, RTX 3060): 32 chamadas de desenho com 4 moradores e 42 com 6, 16,7 ms por quadro, custo da cena de 0,3 a 1 ms. Por software, no nível baixo: 16 a 18 chamadas, 33 ms por quadro. Sem sombras, o mundo parado são 4 chamadas.
- **Não exercitado**: mão de gente no mouse; Firefox, WebKit e toque; rede fora do `localhost`; o cliente montado na página do Recreio (lote X1); a barriga da gravidez em imagem; o bebê crescendo.

Achados para os próximos lotes, todos fora do cliente e ainda abertos:

- O protocolo não leva o apelido das outras pessoas (`PresencaVista.jogadores` tem só o id e o estado). O jogo mostra "outra pessoa" a não ser que quem hospeda entregue `apelidoDe`.
- Regras puras que o cliente usa não são exportadas pelo `@informach/morada-sim` (`podeSerInterrompido`, `impedimentoDoCuidado`, `relacaoExistente`, `saoParentes`). O cliente refez o mínimo; a cópia de `motivoDeDormir` não tem teste contra a original.
- `pulso.tick` sai um passo atrasado (`ator.ts` chama `acadaSegundo()` antes de `avancar`). O estimador do cliente absorve.
- O modo de desenvolvimento do servidor abre uma sessão nova a cada `/dev/entrar` e não renova: depois de 15 minutos a sessão acaba e a pessoa entra de novo. Não afeta o caminho de verdade, em que o SDK renova.
- `PresencaVista.reservas[].moradorId` é `string`, e `EventoDeApresentacao` tem campos soltos.

### J0 a J4 e a parte de simulação do J5 (11/11/2026)

- `pnpm --filter @informach/morada-sim typecheck` (as duas configurações: a da simulação, sem DOM nem Node, e a dos testes): sem erros. `pnpm exec biome check packages/morada-sim`: limpo.
- `pnpm --filter @informach/morada-sim test`: 98 testes em 11 arquivos, 139 s nesta máquina. O que cada arquivo prova está no [guia do package](../../packages/morada-sim/README.md).
- Os cinco passos do teste decisivo passam **na simulação**: família de quatro autônoma e selecionável; casamento com um morador do bairro, que entra na família com o mesmo id, habilidades e relações; bebê que nasce uma vez, aparece entre os moradores da família, é cuidado e passa por duas fases sendo a mesma pessoa; segundo jogador dirigindo outro morador; queda sem aviso com a fila intacta. Falta repetir com servidor e dois clientes de verdade (J6 e J7).
- Dos testes inegociáveis do Morada, cobertos na simulação: 1 a 6, 9 (parto uma vez só, nos três pontos de queda), 11 (vida em suspenso), 12 (velocidade só com acordo) e 15 (ids trocados).
- Medida de custo, sem rede: de 0,07 a 0,10 ms por tick para o mundo da prova (seis moradores, 54 objetos), ou cerca de 1 ms de CPU por segundo de mundo aberto. É medida de bancada desta máquina, não a medição de custo do Marco 0.

Defeitos que os testes acharam e foram corrigidos antes do commit:

- A casa inicial da biblioteca tem cama para dois; com quatro moradores, dois desmaiavam de sono toda noite. A casa da prova passou a ser a Casa Mansarda (quatro camas, um andar), com berço.
- A criança pequena ficava sem energia: a soneca dela era descartada por um custo de caminho medido de dentro do berço.
- A sensação de uma necessidade crítica tinha o prazo renovado sem marcar a mudança, e os campos lentos da replicação só saíam em ticks múltiplos de dez, o que falhava com o mundo acelerado. Achado pelos roteiros aleatórios.
- Um comando de cuidado recusado cancelava antes as ações do cuidador. Agora a conferência vem antes de qualquer mudança, e os roteiros aleatórios testam que comando recusado não muda o mundo.

Decisões tomadas ao implementar:

- A casa e o catálogo da prova são gerados a partir de `casas_prontas.json` do repositório de arte (só ids e medidas, sem peças de pacote). O gerador é o embrião do importador de casas prontas do lote D3.
- Cada ponto de uso tem a vaga e uma lista de acessos; a navegação escolhe o primeiro alcançável em cada casa.
- Um voto de velocidade que ainda espera os outros é aceito e fica à vista; não é uma recusa.
- Os nomes dos clipes de animação nas interações são provisórios até o empacotador conferir a lista contra a biblioteca (lote X2).

O que o P1 deixa para os próximos lotes:

- O cadastro em `/entrar` é aberto mesmo com `RECREIO_ACCESS_MODE=fechado`: a variável só muda textos. A barreira de verdade é `decidirAcesso`, no lote P3.
- Produção exige e-mail em modo real, mas ainda não há rota de webhook do SendGrid; quando ela entrar, volta a exigência de `SENDGRID_WEBHOOK_PUBLIC_KEY`.
- A exclusão de conta pelo Recreio está desligada até existirem as regras de sucessão do mundo.
- `/termos` e `/privacidade` são textos curtos de alfa e precisam da revisão do titular antes de qualquer publicação.

## Pendências fora da frente

- **Arte no histórico do git.** O `informach-apps` está público no GitHub, e o commit que tirou a pasta `ideas/` só apagou os arquivos: os zips dos pacotes e as animações da Mixamo continuam no histórico. Decisão do titular em 11/11/2026: registrar como pendência, sem ação nesta frente. O `AGENTS.md` ainda descreve o repositório como privado; a correção entra no lote X3.
- **Licença ITHappy** por escrito e a conversa jurídica (faixas, verificação de idade, classificação): correm em paralelo e travam só o lançamento público.
- **Uma réplica** do `morada-server` até existir endereço por instância no Railway.
- A migração do schema `recreio` vai para produção no merge na `main`, mesmo com a constante desligada. O merge só acontece depois do lote P6.
