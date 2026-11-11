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
| P4 | Ingresso, sessão, renovação, JWKS, cliente do SDK | a fazer |
| P5 | Mundos, membros, convite | a fazer |
| P6 | Posse, API das instâncias, armazenamento | a fazer |
| P7 | `/jogar/[jogo]`, jogo de teste, E2E com queda da instância | a fazer |

### Etapa 1, jogo

| Lote | Entrega | Estado |
| --- | --- | --- |
| J0 | Modelo: ids, tipos, formatos, invariantes | feito |
| J1 | Núcleo determinístico: relógio, sorteio, comandos, fatos, fotografia | feito |
| J2 | Conteúdo, casa da prova, navegação, necessidades, autonomia | feito |
| J3 | Relações, casamento, gravidez, nascimento, cuidado, fases, políticas de tempo | feito |
| J4 | Sessões, reserva de controle, permissões, visão e mudanças | feito |
| J5 | Persistência e recuperação contra a plataforma falsa | em curso: fotografia, restauração e reaplicação dos fatos feitas na simulação; falta ligar à plataforma no servidor |
| J6 | `apps/morada-server` | a fazer |
| J7 | Quedas injetadas e gerador de carga | a fazer |
| J8 | Cliente com cena procedural e HUD | a fazer |

### Etapa 1, junção

| Lote | Entrega | Estado |
| --- | --- | --- |
| X1 | Plataforma real no servidor, `/jogar/morada`, E2E com duas contas | a fazer |
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
