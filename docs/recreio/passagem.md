# Recreio e Morada: nota de passagem (13/11/2026)

Para quem retoma a frente depois de uma pausa, nesta ou em outra máquina. O registro completo (plano, decisões, verificações) está em [`implementacao.md`](implementacao.md).

## Onde está cada coisa

- **`main` em `3f952fd`** já tem P0–P7, J0–J8 e X1–X3, incluindo recuperação, acesso e operação preparada. Serviços, cron e volume estão definidos atrás de `RECREIO_LAUNCHED=false`; nenhum foi publicado.
- **Continuação na `main`:** arte dos móveis e acabamentos da casa atual, manifesto V2 compatível com V1 e provas com arte real. Ver [review do D1](review-d1-2026-11-13.md).
- **A migração `0080_recreio`** está na `main`. O schema `recreio` passa a existir no banco onde o migrator rodar; nenhum app em produção o lê.
- A branch `feat/recreio` foi juntada à `main` e não tem nada a mais.

## A arte numa máquina nova

**Nenhum arquivo de arte entra neste repositório** (ele é público). O empacotador lê um clone parcial do `informach/artes-3d` (privado) no commit `4f3012101735ffddd066c31bb0bd8319723eb9ba`, sempre fora do repositório, e grava a saída também fora. O recorte de personagens usado no X2 tinha cerca de 550 MB; o D1 acrescenta móveis e construção:

```bash
gh repo clone informach/artes-3d <fora-do-repo>/artes-3d -- --filter=blob:none --no-checkout
cd <fora-do-repo>/artes-3d
git sparse-checkout set --no-cone /LEIA.md '/biblioteca/LEIA*.md' /biblioteca/info.json /biblioteca/rotulos.json \
  /biblioteca/corpos/ /biblioteca/itens/ /biblioteca/roupas_mascaras/ /biblioteca/roupas_gen/ /biblioteca/medidas/ \
  /biblioteca/props/ /biblioteca/moveis/ /biblioteca/construcao/ /codigo/arte/elenco.json /codigo/arte/cabelos.json /codigo/arte/roupas.json /paginas/tipos_de_corpo/ \
  /biblioteca/bibliotecas_30fps/adulto.glb /biblioteca/bibliotecas_30fps/idoso.glb \
  /biblioteca/bibliotecas_30fps/crianca_m.glb /biblioteca/bibliotecas_30fps/bebe_m.glb \
  /biblioteca/bibliotecas_30fps/adulta_gravida.glb
git checkout 4f3012101735ffddd066c31bb0bd8319723eb9ba

# na raiz deste repositório
ARTES_3D_DIR=<fora-do-repo>/artes-3d pnpm --filter @informach/morada-arte empacotar -- --saida <fora-do-repo>/arte-prova \
  --casa packages/morada-sim/src/conteudo/imoveis/casa-prova.v1.json
MORADA_PLATAFORMA=falsa MORADA_REGRAS=prova MORADA_ARTE_DIR=<fora-do-repo>/arte-prova pnpm dev:morada-server
pnpm --filter @informach/jogo-morada bancada     # http://localhost:5173/?apelido=Lia&arte
```

O empacotamento gera arquivos determinísticos com hash; sem `--casa`, inclui só personagens. Sem a arte, tudo continua procedural, como no CI. Ver tempos e tamanhos medidos no review do D1.

Os testes de integração e o E2E do portal pedem um `DATABASE_URL` local (aceitam o `.env` da raiz); eles criam e apagam um banco descartável.

## Continuação de 13/11

O X3 já foi integrado à `main`; a passagem anterior dizia incorretamente que ele estava só em branch local. O D1 acrescenta a arte da casa atual e a revisão dessa integração. As provas visuais e os E2E ficam descritos no [review do D1](review-d1-2026-11-13.md).

Para repetir o portal com arte, em banco local descartável:

```bash
RECREIO_E2E_ARTE_DIR=<fora-do-repo>/arte-prova DATABASE_URL=<postgres-local> \
  pnpm --filter @informach/recreio-app e2e
```

Esse opt-in declara `assets` no SDK/CSP, entrega a pasta ao servidor do jogo e guarda capturas/traces em uma pasta irmã da arte, fora do repositório. O comando normal de E2E continua sem arte.

## Próximos passos

1. D2: criação da família; depois D3–D8 conforme os critérios do plano. A meta de FPS do D1 ainda precisa de medição em vídeo integrado real.
2. X4, em frente operacional separada: deploy fechado e custo por hora de mundo com 1, 2, 4 e 8 pessoas, seguindo [PRODUCAO.md](../../apps/recreio/PRODUCAO.md).

## Abertos que pedem decisão do titular

- Os zips de pacotes de arte e as animações da Mixamo continuam no histórico do git deste repositório público.
- Licença ITHappy por escrito e a conversa jurídica, que travam só o lançamento público.
- `/termos` e `/privacidade` do Recreio pedem revisão.
