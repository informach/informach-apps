# Roupas e acessórios

Todas as peças de roupa e os acessórios dos pacotes gratuitos (65 peças), mais variações feitas a partir delas, servem em todos os corpos, menos no
recém-nascido, que usa a manta. Isso vale para a criança, o bebê, o plus e o idoso. Na grávida, a peça acompanha os
três estágios de barriga.

## Onde fica cada coisa

- `codigo/morada-art/roupas.json`: o catálogo, a única lista de peças. É lido pela ferramenta que veste os corpos e
  pela página. Cada peça tem:
  - `id`;
  - `slot`: a parte do corpo. Só uma peça por slot. `inteira` (fantasia) ocupa cima e baixo;
  - `rotulo`: o nome que aparece na página;
  - `arquivo`, `corpo_origem` e `pecas`: o FBX e as malhas de origem;
  - `tipo`: `pele`, `cabeca` ou `rosto` (veja abaixo).
- `codigo/morada-art/roupas.py`: o encaixe.
  - **`pele`**: cada ponto da peça fica preso ao triângulo mais perto da pele do personagem de origem, com a posição
    dentro dele e a distância até a pele. Depois é recolocado no mesmo lugar da pele do nosso corpo, à mesma distância
    (proporcional à altura).
    - Corpo de origem e destino com a mesma malha (família masculina, feminina ou plus do pacote): o triângulo é o
      mesmo.
    - Malhas diferentes: cada ponto da pele de origem vai para o lugar correspondente do corpo de destino (um raio pela
      normal), e a peça inteira se move junto, pela média dos deslocamentos da pele mais perto. Assim ela incha ou
      encolhe com o corpo sem rasgar.
    - Barriga de gravidez: cada forma do corpo gera a mesma forma na peça.
    - Pesos do esqueleto: são os da pele embaixo, suavizados ao longo da peça.
    - Nenhum ponto nem meio de aresta fica a menos de 5 mm da pele. Peças de poucos polígonos são subdivididas antes, e as
      largas guardam o deslocamento inteiro no referencial do triângulo (não só a distância).
  - **`cabeca` e `rosto`** (chapéus, óculos, fones, nariz): presos ao osso da cabeça pela caixa da cabeça, como os
    cabelos. Os de `rosto` ainda andam para a frente se afundarem no rosto.
- `codigo/ferramentas/veste.py`: veste os corpos prontos do arquivo-mestre com as peças do catálogo.

## Variações (cópias modificadas das peças)

No catálogo, uma variação tem `"base"` (a peça de onde vem) e `"variacao"`. Ela herda arquivo, peças, tipo e slot da base.

- `cortes`: corta a peça num marco do corpo de origem e faz bainha na borda nova.
  - Marcos: ombro, meio do braço, cotovelo, cintura, meio da coxa, joelho, meio da canela e tornozelo.
  - Exemplos: calça vira bermuda, short ou capri; camiseta vira regata, cropped ou top; paletó e jaqueta viram colete;
    mangas compridas ficam curtas; bota vira botina (`"acima": true` tira o que fica acima do marco).
- `forma` (chapéus): `aba` (raio da aba), `copa` (altura) e `aba_frente` (boné: aba só na frente).
- `cor`: a cor inicial na página.

Peças feitas aqui:
- **Saias** (`"gerar"`): anéis em volta do corpo de origem, da cintura até o marco pedido, abrindo até a `abertura`
  na barra. A cor é lisa, no mesmo lugar da paleta da peça de referência.
- **Vestidos** (`"compoe"`): uma blusa e uma saia, encaixadas e juntadas numa malha só, de uma cor.

## Cor livre

Toda peça tem uma máscara (`roupas_mascaras/<id>__<material>.png`, cinza, 512 px) da parte da paleta com a cor
principal dela. `mascaras.json` guarda também a luminância dessa cor (linear). Para pintar:

```
cor_final = mistura(textura, cor_escolhida × (luminância do pixel ÷ luminância da cor principal), máscara)
```

O sombreado e os detalhes de outras cores ficam como estão. É o que a página faz no shader, e o jogo deve fazer igual.
Por isso não existem cópias de peças só para mudar a cor: qualquer cor serve.

## Conjuntos

`conjuntos` no catálogo: profissões e estilos prontos (executivo, médico, chef, operário, segurança, garçom,
esportista, Papai Noel, fazendeiro, mágico, palhaço, aventureiro, praia, inverno). Cada um diz a peça e a cor de cada
slot.

## Pele embaixo da roupa

Onde o corpo não deixa espaço (as coxas do plus se encostam) ou em movimento, a pele pode atravessar a roupa. A página
esconde os triângulos do corpo cobertos por uma peça visível. Um vértice do corpo está coberto quando um raio na
direção da normal dele acerta a peça a até 5 cm (proporcional à altura). Só se esconde o triângulo com os três vértices
cobertos. O cálculo usa as posições pelo esqueleto. O jogo deve fazer o mesmo.

## Nos arquivos

- No arquivo-mestre e no GLB de cada corpo, cada peça é uma malha `<corpo>_<id>`. O id também vai nos extras do nó
  (`roupa` e `slot`).
- A textura é a paleta do pacote de origem, num material `Roupa_<pacote>_<textura>`.
  - O GLB não leva a imagem. A página carrega cada paleta uma vez, de `roupas/<material>.png`.
  - Os GLB dos corpos são comprimidos com Meshopt (`tools/comprime_corpos.sh`; o three.js lê com o MeshoptDecoder).
  - No jogo, o material com esse nome usa a paleta dele.
- Na grávida, as peças têm as formas `gravidez_1`, `gravidez_2` e `gravidez_3`, com o mesmo peso usado no corpo.

## Para acrescentar uma peça

1. Acrescente um item em `roupas.json`.
2. Vista os corpos só com ela:
   ```bash
   python veste.py -- corpos.blend <id>
   ```
   Para refazer uma peça que já existe, use `REFAZ=1`.
3. Exporte os corpos (`corpo_exporta.py`) e rode `biblioteca_pacote.py`.

Qualquer FBX serve, desde que traga o corpo do personagem de origem com a roupa vestida, na mesma pose da malha.

## Limites conhecidos

- **Textura na barriga:** na barriga de grávida a textura da frente estica junto com a peça. Na camiseta fica natural.
  Em paletó aberto e cinto de fivela, a parte da frente aumenta.
- **Chapéus e cabelo:** os chapéus não escondem o cabelo. Com cabelo volumoso, escolha um penteado curto ou raspado.
- **Peças largas:** saia, fantasia e casaco comprido seguem a perna mais perto. Em passos largos, podem atravessar um
  pouco a outra perna.

## Para o jogo (recomendado)

Como no cabelo:
- uma malha por peça, carregada só quando alguém escolhe;
- por corpo, a ligação da peça com a pele (triângulo, posição e distância).

Assim uma peça nova entra sem regerar os corpos.
