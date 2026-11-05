# Roupas e acessórios

Todas as peças de roupa e os acessórios dos pacotes gratuitos (65 peças) servem em todos os corpos, menos no
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
    - Malhas diferentes: o ponto vai para o lugar mais perto da malha-base do destino.
    - Barriga de gravidez: cada forma do corpo gera a mesma forma na peça.
    - Pesos do esqueleto: são os da pele embaixo, suavizados ao longo da peça.
    - Nenhum ponto fica a menos de 3 mm da pele.
  - **`cabeca` e `rosto`** (chapéus, óculos, fones, nariz): presos ao osso da cabeça pela caixa da cabeça, como os
    cabelos. Os de `rosto` ainda andam para a frente se afundarem no rosto.
- `codigo/ferramentas/veste.py`: veste os corpos prontos do arquivo-mestre com as peças do catálogo.

## Nos arquivos

- No arquivo-mestre e no GLB de cada corpo, cada peça é uma malha `<corpo>_<id>`. O id também vai nos extras do nó
  (`roupa` e `slot`).
- A textura é a paleta do pacote de origem, num material `Roupa_<pacote>_<textura>`.
  - O GLB não leva a imagem. A página carrega cada paleta uma vez, de `roupas/<material>.png`.
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
