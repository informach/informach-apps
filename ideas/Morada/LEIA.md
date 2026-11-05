# Morada: personagens e animações (trabalho em andamento)

Pasta provisória para não perder o que foi feito. Quando existir o app do jogo, isto vai para o lugar certo.
Os personagens derivam dos pacotes gratuitos da ITHappy que estão em `ideas/` (zips): **uso interno, não distribuir**.

## O que tem aqui

| pasta | conteúdo |
|---|---|
| `biblioteca/` | **o resultado**: 14 bibliotecas de animação a 30 fps (`bibliotecas_30fps/`, 11 normais + 3 de grávida), os 19 corpos em GLB (`corpos/`: malha, esqueleto, expressões, barriga de grávida, recém-nascidos e todos os cabelos, barbas e bigodes dos pacotes), `info.json` (apoios de cena e correções), `rotulos.json` (nomes e categorias), `medidas/` (o json de cada biblioteca), `LEIA.md` com o uso no jogo e `LEIA_cabelos.md` (catálogo de cabelos e como acrescentar um) |
| `blend/` | `corpos.blend` (arquivo-mestre editável dos corpos, com os recém-nascidos e todos os cabelos) em 5 partes, e `mixamo_pacote.blend` (animações do Mixamo já no esqueleto do pacote, usado pelo gerador de corpos) |
| `mixamo/` | os FBX baixados do Mixamo (P0 por corpo, P1, P2), o prompt usado para baixá-los, o log, os manifestos, `nao_encontrados.md`, o índice que liga cada arquivo a um ID e a um corpo, e o zip dos 17 corpos enviados ao Mixamo |
| `codigo/arte/` | geradores: `corpos.py` (tipos de corpo), `cabelos.json` + `cabelos.py` (catálogo e encaixe de cabelos), `expressoes.py`, `contato.py`, `gravidez.py`, cena e páginas do Morada |
| `codigo/ferramentas/` | conversão do Mixamo (`biblioteca_bake.py`), correções (`biblioteca_corrige.py`, `biblioteca_chao.py`, `biblioteca_antebraco.py`, `pequeno_corrige.py`, `biblioteca_dedos.py`: pegada dos dedos nos objetos), cabelos novos em corpos prontos (`adiciona_cabelo.py`), reconstrução completa (`_rebuild_all.sh` e os `_rb_*.sh`), animações compostas (`compor.py`, `compor_gravida.py`), biblioteca de grávida (`gravida_biblioteca.py`), exportação (`biblioteca_exporta.py`, `corpo_exporta.py`), pacote da página (`biblioteca_pacote.py`) e testes de página (`teste_*.js`) |
| `paginas/` | `morada.html` e `recreio.html` (propostas), as fontes delas (`v4/`, `rv2/`) e a página Tipos de corpo (`tipos_de_corpo/corpos.html`, que carrega `corpos/*.txt` e `biblioteca/*.txt`: base64 dos GLB, gerados por `biblioteca_pacote.py`) |

Não estão aqui (dá para regenerar a partir do que está): blends intermediários das bibliotecas, renders de revisão, testes.
As bibliotecas a 30 fps têm uma chave por quadro: reimportadas no Blender, equivalem às ações originais.

## Remontar o arquivo-mestre

```bash
cat blend/corpos.blend.xz.parte0* > corpos.blend.xz
sha256sum -c blend/SHA256SUMS   # confere as partes antes de juntar
xz -d corpos.blend.xz
```

## Ambiente usado

Blender 5 como módulo Python (`pip install bpy` num venv com Python 3.13), numpy, Pillow; Playwright + Chromium para os
testes da página. Os scripts recebem os caminhos por argumento (`python script.py -- <entrada> <saída> ...`); o
cabeçalho de cada um explica o uso. Os caminhos do `mixamo/biblioteca_indice.json` são da máquina onde foi feito:
dentro dos zips de `mixamo/fbx/` os arquivos mantêm o mesmo caminho relativo (`mixamo_p0_todos/...`, `mixamo_p1/...`,
`mixamo_p2/...`).

## Página publicada

Tipos de corpo: https://claude.ai/artifact/Uw3fipkYR7aSq3dZFmZiMd (privada).
