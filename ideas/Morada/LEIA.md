# Morada: personagens e animações (trabalho em andamento)

Pasta provisória para não perder o que foi feito. Quando existir o app do jogo, isto vai para o lugar certo.
Os personagens derivam dos pacotes gratuitos da ITHappy que estão em `ideas/` (zips): **uso interno, não distribuir**.

## O que tem aqui

| pasta | conteúdo |
|---|---|
| `biblioteca/` | **o resultado**: 14 bibliotecas de animação a 30 fps (`bibliotecas_30fps/`, 11 normais + 3 de grávida), os 19 corpos em GLB (`corpos/`: malha, esqueleto, expressões, barriga de grávida e recém-nascidos, sem as peças dos catálogos), as peças e os cabelos em arquivos separados (`itens/`: um por item, mais `familias.txt` e `peles.txt`, montados no corpo quando alguém escolhe), `info.json` (apoios de cena e correções), `rotulos.json` (nomes e categorias), `medidas/` (o json de cada biblioteca), `LEIA.md` com o uso no jogo, `LEIA_cabelos.md` e `LEIA_roupas.md` (catálogos, formato dos itens e como acrescentar um), `roupas_mascaras/` (cor livre), `roupas_gen/` (texturas das peças geradas) e `miniaturas_itens/` (a imagem de cada item) |
| `blend/` | `corpos.blend` (arquivo-mestre editável dos corpos, com os recém-nascidos e todos os cabelos, cada um com a forma `sob_chapeu`) em 5 partes (`cat corpos.blend.xz.parte0* | xz -d > corpos.blend`), e `mixamo_pacote.blend` (animações do Mixamo já no esqueleto do pacote, usado pelo gerador de corpos) |
| `mixamo/` | os FBX baixados do Mixamo (P0 por corpo, P1, P2), o prompt usado para baixá-los, o log, os manifestos, `nao_encontrados.md`, o índice que liga cada arquivo a um ID e a um corpo, e o zip dos 17 corpos enviados ao Mixamo |
| `codigo/arte/` | geradores: `corpos.py` (tipos de corpo), `cabelos.json` + `cabelos.py` (catálogo e encaixe de cabelos), `roupas.json` + `roupas.py` (catálogo e encaixe de roupas), `geradores.py` + `novas_pecas.py` (peças feitas aqui e conjuntos), `expressoes.py`, `contato.py`, `gravidez.py`, cena e páginas do Morada |
| `codigo/ferramentas/` | conversão do Mixamo (`biblioteca_bake.py`), correções (`biblioteca_corrige.py`, `biblioteca_chao.py`, `biblioteca_antebraco.py`, `pequeno_corrige.py`, `biblioteca_dedos.py`: pegada dos dedos nos objetos), cabelos novos em corpos prontos (`adiciona_cabelo.py`), reconstrução completa (`_rebuild_all.sh` e os `_rb_*.sh`), animações compostas (`compor.py`, `compor_gravida.py`), biblioteca de grávida (`gravida_biblioteca.py`), exportação (`biblioteca_exporta.py`, `corpo_exporta.py`, `exporta_itens.py` e `peles.py` para as peças em arquivos separados), pacote da página (`biblioteca_pacote.py`) e testes de página (`teste_*.js`) |
| `paginas/` | `morada.html` e `recreio.html` (propostas), as fontes delas (`v4/`, `rv2/`), a página Tipos de corpo (`tipos_de_corpo/corpos.html`, que carrega `corpos/*.txt`, `biblioteca/*.txt` e `itens/*.txt`, gerados por `biblioteca_pacote.py`) e a página Bichos do Morada (`bichos/bichos.html`) |

Não estão aqui (dá para regenerar a partir do que está): blends intermediários das bibliotecas, renders de revisão, testes.
As bibliotecas a 30 fps têm uma chave por quadro: reimportadas no Blender, equivalem às ações originais.

## Roupas

As peças estão em todos os corpos, menos no recém-nascido, inclusive nas grávidas nos três estágios. São 317:
- as 65 roupas e acessórios dos pacotes;
- variações feitas a partir delas;
- 209 peças geradas aqui, com as imagens da vitrine do pacote como norte (profissões e casuais):
  - roupas: jaleco, paletós com lapela, smoking, jaqueta de aviador, moletom com capuz, capa de chuva, jeans rasgado,
    calça boca de sino, biquíni, vestidos, macacões, colete salva-vidas;
  - acessórios: botas, luvas, cachecol, lenço, cintos com fivela e mais de 40 chapéus (o boné com hélice entre eles);
  - óculos gerados no rosto;
  - meia-calça, meia 7/8 e mangas de arrastão (trama com furos, a pele aparece);
  - 58 objetos de mão, com a vitrine de props do pacote como norte (e a guia retrátil de cachorro): celular, café, microfone, sorvete, câmera, livro,
    caderno, jornal, tablet, buquê, cartaz, rádio, lanterna, garrafa, 20 bolsas, malas e sacolas (de pérolas, academia,
    pastas, maletas, extintor, estojo de violão, caixa de ferramentas, sacola de papel com compras), frigideira,
    espátula, bandeja, 5 bolas, pincel e paleta, caixas de presente, ancinho, tesoura de poda, chave inglesa, bengala,
    guarda-chuvas (fechado, aberto, colorido, listrado) e pau de selfie.

Toda peça tem cor livre. Há 109 conjuntos prontos (profissões e estilos). São 64 cabelos, barbas e bigodes, com rabo de
cavalo, coques, tranças, black power, moicano e espetado.

Os corpos não carregam as peças. Cada peça é um arquivo próprio, montado no corpo pela página quando alguém escolhe, e
o jogo deve fazer igual. Uma peça nova entra sem regerar os corpos.

Na página:
- cada item tem miniatura, e a escolha é por imagem;
- com chapéu, o cabelo acima da aba não aparece;
- com um objeto na mão, os dedos fecham em volta dele;
- nos gestos (acenar, apontar, telefone, palmas), o objeto passa para a outra mão, se ela estiver livre; senão, some
  até o gesto acabar;
- cada objeto de mão tem a sua pose de segurar (IK do braço daquele lado): o café e o sorvete na frente do corpo, o
  celular com a tela para o rosto, o microfone perto da boca, a câmera na altura dos olhos, o guarda-chuva aberto sobre
  a cabeça, as bolsas e a bengala ao lado do corpo. O resto do corpo segue a animação, e o braço acompanha o vaivém
  dela ao andar, para a frente e um pouco para o lado; a bolsa balança como um pêndulo e não atravessa as pernas nem
  o tronco (a barriga da gestante inclusive); as alças ficam presas no objeto e passam por dentro da mão fechada;
- sentado, a bolsa, a mala e a bengala vão para o chão ao lado da cadeira, paradas enquanto a pessoa se mexe pouco
  (se ela se desloca sentada, o objeto vem junto, arrastado), e a mão que trabalha (comer, digitar)
  solta o objeto; deitado, os objetos de mão saem de cena.

No arquivo-mestre (`blend/`), cada cabelo tem a forma `sob_chapeu`, ligada à propriedade `com_chapeu` do esqueleto:
com chapéu (1), o cabelo não atravessa a copa.

O catálogo, o encaixe, o formato dos arquivos e como acrescentar uma peça estão em `biblioteca/LEIA_roupas.md`.

## Bichos de estimação

Treze bichos feitos a partir do Doberman do pacote Apocalypse, com as onze animações dele ajustadas a cada um
(`biblioteca/bichos/`, gerados por `codigo/arte/bichos.py`; detalhes em `biblioteca/bichos/LEIA.md`):
Doberman e Doberman marrom, Labrador, Rottweiler, dois Salsichas, Spitz branco, três Lulus (branco, rosa e azul) e três
gatos (preto, frajola e laranja). Cada um muda as proporções dos ossos (a malha vai junto e as animações continuam
valendo), as cores, as orelhas, a cauda e, alguns, ganham pelo fofo, coleira ou bigode. As animações: parado, andar,
correr, virar, latir (miar), pedir para brincar, dar a pata, cambalhota, deitar, barriga para cima e dormir.

## Cena de exemplo

`biblioteca/cenas/familia.png`: uma família reunida para a foto (doze pessoas e o labrador com a guia), montada só com
corpos, roupas, cabelos, expressões, poses da biblioteca e um bicho, por `codigo/arte/cena_familia.py` (arquivo da cena:
`biblioteca/cenas/familia.blend`; como foi feita em `biblioteca/cenas/LEIA.md`).

`biblioteca/cenas/cidade.png`: uma praça vista de cima com 29 pessoas no dia a dia (andando, ao telefone, de selfie, no
banco, deitado, empurrando carrinho, de bengala...), por `codigo/arte/cena_cidade.py`; o banco e o carrinho de bebê são
feitos pela cena.

## Animações aprovadas

As animações marcadas como boas na página ficam congeladas: corrigir outra animação nunca muda uma delas. O procedimento
está em `biblioteca/LEIA_congeladas.md`, e a ferramenta é `codigo/ferramentas/congeladas.py`.

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

Bichos do Morada: https://claude.ai/artifact/Jmqybk3QQhGu7HKRmSkKmA (privada).
