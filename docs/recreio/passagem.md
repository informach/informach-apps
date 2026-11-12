# Recreio e Morada: nota de passagem (12/11/2026)

Para quem retoma a frente depois de uma pausa, nesta ou em outra máquina. O registro completo (plano, decisões, verificações) está em [`implementacao.md`](implementacao.md).

## Onde está cada coisa

- **`main`** tem a etapa 1 até o lote X2: lotes P0 a P7, J0 a J8, X1 e X2, todos verificados localmente. A condição de saída da etapa 1 passa de ponta a ponta na máquina de desenvolvimento (duas contas, uma cai, a outra continua, a instância é morta e tudo volta), e os moradores já aparecem com os corpos de verdade quando o servidor do jogo tem a arte. Nada disso está publicado: não há serviço do Recreio nem do Morada no `.railway/railway.ts`.
- **A migração `0080_recreio`** está na `main`. O schema `recreio` passa a existir no banco onde o migrator rodar; nenhum app em produção o lê.
- A branch `feat/recreio` foi juntada à `main` e não tem nada a mais.

## A arte numa máquina nova

**Nenhum arquivo de arte entra neste repositório** (ele é público). O empacotador lê um clone parcial do `informach/artes-3d` (privado) no commit `4f3012101735ffddd066c31bb0bd8319723eb9ba`, sempre fora do repositório, e grava a saída também fora. Cerca de 550 MB:

```bash
gh repo clone informach/artes-3d <fora-do-repo>/artes-3d -- --filter=blob:none --no-checkout
cd <fora-do-repo>/artes-3d
git sparse-checkout set --no-cone /LEIA.md '/biblioteca/LEIA*.md' /biblioteca/info.json /biblioteca/rotulos.json \
  /biblioteca/corpos/ /biblioteca/itens/ /biblioteca/roupas_mascaras/ /biblioteca/roupas_gen/ /biblioteca/medidas/ \
  /biblioteca/props/ /codigo/arte/elenco.json /codigo/arte/cabelos.json /codigo/arte/roupas.json /paginas/tipos_de_corpo/ \
  /biblioteca/bibliotecas_30fps/adulto.glb /biblioteca/bibliotecas_30fps/idoso.glb \
  /biblioteca/bibliotecas_30fps/crianca_m.glb /biblioteca/bibliotecas_30fps/bebe_m.glb \
  /biblioteca/bibliotecas_30fps/adulta_gravida.glb
git checkout 4f3012101735ffddd066c31bb0bd8319723eb9ba

# na raiz deste repositório
ARTES_3D_DIR=<fora-do-repo>/artes-3d pnpm --filter @informach/morada-arte empacotar -- --saida <fora-do-repo>/arte-prova
MORADA_PLATAFORMA=falsa MORADA_REGRAS=prova MORADA_ARTE_DIR=<fora-do-repo>/arte-prova pnpm dev:morada-server
pnpm --filter @informach/jogo-morada bancada     # http://localhost:5173/?apelido=Lia&arte
```

O empacotamento leva cerca de 40 s e é determinístico (os hashes estão no registro). Sem a arte, tudo roda com corpos procedurais, como no CI.

Os testes de integração e o E2E do portal pedem um `DATABASE_URL` local (aceitam o `.env` da raiz); eles criam e apagam um banco descartável.

## Próximos passos, em ordem

1. **X3**, o que falta da etapa 1: serviços e cron no `.railway/railway.ts` atrás de `RECREIO_LAUNCHED=false`; build e `start` de produção do `apps/morada-server` (hoje roda com `tsx`, que é dependência de desenvolvimento), incluindo onde a arte empacotada fica no serviço (`MORADA_ARTE_DIR`) sem entrar no repositório; `RECREIO_API_URL` exige `https` em produção, o que recusa o endereço interno do Railway; registro mínimo no Bastidores; guarda de exclusão de conta; `PRODUCAO.md`; corrigir "repositório privado" no `AGENTS.md`. O `railway config plan` passa pela revisão do titular antes de aplicar.
2. **X4**, só com autorização do titular: deploy fechado e medição do custo por hora de mundo com 1, 2, 4 e 8 pessoas.
3. Etapa 2 (D1 a D8). O D1 traz a arte dos móveis: hoje a caixa procedural da cama tem a altura da cabeceira e cobre quem deita.

Ficou sem ver no jogo, e vale olhar no começo do X3 ou do D1: sentar e deitar com a arte, a gravidez, o bebê no colo e `/jogar/morada` com `RECREIO_GAME_ORIGINS.morada.assets` declarado (CSP e SDK de verdade). Detalhes na seção do X2 do registro.

## Abertos que pedem decisão do titular

- `restaurar` do `@informach/morada-sim` devolve o mundo parado no tick do último fato, e o id dos fatos leva o tick: o primeiro fato depois da volta pode repetir um id. O servidor contorna; a causa está na simulação.
- Os zips de pacotes de arte e as animações da Mixamo continuam no histórico do git deste repositório público.
- Licença ITHappy por escrito e a conversa jurídica, que travam só o lançamento público.
- `/termos` e `/privacidade` do Recreio pedem revisão.
