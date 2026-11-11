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
| P1 | Esqueleto do `apps/recreio` e registros no monorepo | a fazer |
| P2 | Schema `recreio`, migração, grupos, perfis, sessão de aparelho | a fazer |
| P3 | Carregador de acesso, concessões, scripts `conceder` e `revogar` | a fazer |
| P4 | Ingresso, sessão, renovação, JWKS, cliente do SDK | a fazer |
| P5 | Mundos, membros, convite | a fazer |
| P6 | Posse, API das instâncias, armazenamento | a fazer |
| P7 | `/jogar/[jogo]`, jogo de teste, E2E com queda da instância | a fazer |

### Etapa 1, jogo

| Lote | Entrega | Estado |
| --- | --- | --- |
| J0 | Modelo: ids, tipos, formatos, invariantes | a fazer |
| J1 | Núcleo determinístico: relógio, sorteio, comandos, fatos, fotografia | a fazer |
| J2 | Conteúdo, casa da prova, navegação, necessidades, autonomia | a fazer |
| J3 | Relações, casamento, gravidez, nascimento, cuidado, fases, políticas de tempo | a fazer |
| J4 | Sessões, reserva de controle, permissões, visão e mudanças | a fazer |
| J5 | Persistência e recuperação contra a plataforma falsa | a fazer |
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

## Pendências fora da frente

- **Arte no histórico do git.** O `informach-apps` está público no GitHub, e o commit que tirou a pasta `ideas/` só apagou os arquivos: os zips dos pacotes e as animações da Mixamo continuam no histórico. Decisão do titular em 11/11/2026: registrar como pendência, sem ação nesta frente. O `AGENTS.md` ainda descreve o repositório como privado; a correção entra no lote X3.
- **Licença ITHappy** por escrito e a conversa jurídica (faixas, verificação de idade, classificação): correm em paralelo e travam só o lançamento público.
- **Uma réplica** do `morada-server` até existir endereço por instância no Railway.
- A migração do schema `recreio` vai para produção no merge na `main`, mesmo com a constante desligada. O merge só acontece depois do lote P6.
