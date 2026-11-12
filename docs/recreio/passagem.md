# Recreio e Morada: nota de passagem (12/11/2026)

Para quem retoma a frente depois de uma pausa. O registro completo (plano, decisões, verificações) está em [`implementacao.md`](implementacao.md).

## Onde está cada coisa

- **`main`** tem a etapa 1 até a junção X1: lotes P0 a P7, J0 a J8 e X1, todos verificados. A condição de saída da etapa 1 passa de ponta a ponta na máquina de desenvolvimento (duas contas, uma cai, a outra continua, a instância é morta e tudo volta). Nada disso está publicado: não há serviço do Recreio nem do Morada no `.railway/railway.ts`.
- **A migração `0080_recreio`** entrou na `main` com esse merge. O schema `recreio` passa a existir no banco onde o migrator rodar; nenhum app em produção o lê.
- **Branch local `feat/recreio`** (worktree `.claude/worktrees/recreio`, não publicado): o mesmo que a `main` mais um commit `wip` com a segunda metade do X2 pela metade. Esse commit não foi verificado e não pode ir para a `main` como está: `packages/morada-arte/package.json` declara dependências que ainda não estão no `pnpm-lock.yaml`, e o CI quebraria no `pnpm install --frozen-lockfile`.

## O que está pela metade (commit `wip` em `feat/recreio`)

Lote X2, trazer o empacotador de arte para o monorepo e mostrar os corpos reais no jogo:

- `packages/morada-arte`: o código do protótipo copiado. Falta rodar `pnpm install` (alinhando as versões de zod, vitest, typescript e @types/node às do monorepo), tirar os `any` dos scripts de verificação ou deixá-los fora do pacote, typecheck, testes e Biome. O manifesto deve ser escrito sem espaços.
- `apps/morada-server/src/arte.ts` e `test/arte.test.ts`: entrega da arte só para sessão de jogo válida, a partir de `MORADA_ARTE_DIR` (só nomes do manifesto, `Cache-Control: private, max-age=31536000, immutable`, brotli pré-comprimido, CORS só para `MORADA_ORIGENS`). Começado, sem verificação.
- `packages/jogo-morada/src/ativos/escolhas.ts`: começo dos ativos de pacote no cliente. Falta o `AtivosDeArte` atrás da interface `Ativos`, o campo da origem da arte em `OpcoesDeMontagem` (`packages/recreio/src/sdk/modulo.ts`) e em `OpcoesDoMorada`, e `jogo.ts` deixar de criar `AtivosProcedurais` fixo.
- Critério de pronto: dois adultos, a criança e o bebê da família da prova aparecem com os corpos reais, andam, sentam e dormem; download inicial medido. O protótipo mediu cerca de 2 MB com brotli para o elenco da prova e as cinco bibliotecas de animação.

**Nenhum arquivo de arte entra neste repositório** (ele é público). A arte é lida de um clone do `informach/artes-3d`, fixado no commit `4f3012101735ffddd066c31bb0bd8319723eb9ba`, fora do repositório, e a saída do empacotador também fica fora.

## Próximos passos, em ordem

1. Terminar o X2 a partir do commit `wip` e verificar.
2. X3: serviços e cron no `.railway/railway.ts` atrás de `RECREIO_LAUNCHED=false`; build e `start` de produção do `apps/morada-server` (hoje roda com `tsx`, que é dependência de desenvolvimento); `RECREIO_API_URL` exige `https` em produção, o que recusa o endereço interno do Railway; registro mínimo no Bastidores; guarda de exclusão de conta; `PRODUCAO.md`; corrigir "repositório privado" no `AGENTS.md`. O `railway config plan` passa pela revisão do titular antes de aplicar.
3. X4, só com autorização do titular: deploy fechado e medição do custo por hora de mundo com 1, 2, 4 e 8 pessoas.
4. Etapa 2 (D1 a D8).

## Abertos que pedem decisão do titular

- `restaurar` do `@informach/morada-sim` devolve o mundo parado no tick do último fato, e o id dos fatos leva o tick: o primeiro fato depois da volta pode repetir um id. O servidor contorna; a causa está na simulação.
- Os zips de pacotes de arte e as animações da Mixamo continuam no histórico do git deste repositório público.
- Licença ITHappy por escrito e a conversa jurídica, que travam só o lançamento público.
- `/termos` e `/privacidade` do Recreio pedem revisão.
