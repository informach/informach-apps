# Móveis

Segunda parte da biblioteca de móveis e ambientes (a primeira é `construcao/`: chão, paredes, portas e janelas). São
**958 peças em 20 categorias**, todas com miniatura. Foram feitas aqui tendo como norte as imagens da vitrine do pacote
de móveis (não são cópias). Entram também as 47 peças do pacote gratuito Cute Furniture, com o selo `pacote`: **uso
interno, não distribuir**. Algumas aparecem em mais de uma cor, e por isso são 51 itens marcados.

Página: `paginas/moveis/moveis.html`. Nela se escolhe a peça no catálogo, gira com o mouse, abre portas e gavetas
(clicando nelas ou pelos botões), põe objetos da própria biblioteca nos espaços internos e mostra os espaços e a colisão.

## Categorias

| Categoria | Peças | Desenhos | Interativos |
|---|---:|---:|---:|
| `sofas`: sofás, divãs e espreguiçadeiras | 33 | 19 | 0 |
| `pufes` | 8 | 8 | 1 |
| `cadeiras`: cadeiras, poltronas e banquetas | 59 | 53 | 0 |
| `mesas`: jantar, centro, laterais, escrivaninhas, infantis, de jardim e balcões | 51 | 43 | 12 |
| `racks_tv` | 18 | 12 | 30 |
| `estantes`: estantes, nichos e prateleiras de parede | 16 | 15 | 1 |
| `lareiras`: lareiras, fogareiros e tubos de chaminé | 18 | 16 | 5 |
| `camas` | 42 | 22 | 28 |
| `criados`: criados-mudos | 34 | 18 | 31 |
| `armarios`: guarda-roupas, armários e cômodas | 34 | 16 | 111 |
| `sapateiras` | 11 | 9 | 10 |
| `cozinha_moveis`: módulos de 7 linhas e fogões | 220 | 129 | 417 |
| `cozinha_eletros`: eletrodomésticos, grills, utensílios e louça | 138 | 76 | 90 |
| `banheiro` | 112 | 82 | 61 |
| `luminarias` | 18 | 18 | 0 |
| `quadros` | 23 | 23 | 0 |
| `tapetes` | 12 | 9 | 0 |
| `plantas` | 23 | 23 | 0 |
| `livros` | 16 | 14 | 0 |
| `objetos`: piano, TVs, som, computadores, ginástica, brinquedos, notas adesivas etc. | 72 | 58 | 7 |
| **Total** | **958** | **663** | **804** |

A coluna "Interativos" conta as portas, gavetas, tampas e portas de correr. Os espaços internos (`slots`) são 1.497
no total. Com as 124 peças de construção, a biblioteca chega a 1.082 peças.

## Arquivos de cada categoria (`<categoria>/`)

- `glb/<id>.glb`: a peça, em metros, com Y para cima (no Blender, Z para cima e a frente para −Y).
- `miniaturas/<id>.webp`: 192 px, fundo transparente, a mesma luz e o mesmo ângulo para a biblioteca toda.
- `catalogo.json`: um item por peça, com estes campos:
  - `id`, `rotulo`, `grupo` (o desenho; as cores do mesmo desenho têm o mesmo grupo), `tags`;
  - `fixacao`: `chao`, `parede`, `apoio` (vai em cima de outro móvel) ou `teto`; as peças de parede têm também
    `altura_instalacao`;
  - `dims`: largura × profundidade × altura, em metros;
  - `interativos`, `slots`, `colisao`;
  - `cores`, `tris`, `pacote`; as luminárias têm também `luz`.

`paleta_moveis.png` é o atlas de 16 × 16 cores que todas as peças usam. `vitrines/` tem as vitrines renderizadas no
Blender, fechadas e com portas e gavetas abertas.

## Cena de exemplo (`cenas/`)

`quarto_azul.png` é um quarto azul cheio de objetos, montado só com peças da biblioteca: as paredes e o chão da
construção (com a textura degradê azul) e 71 móveis e objetos dos catálogos (a lista está em `quarto_azul.json`). A
cena foi feita para mostrar a biblioteca, seguindo uma imagem de referência da vitrine.

Para ela, entraram 4 peças que faltavam:

- as notas adesivas (uma e um grupo);
- a prateleira de parede com mãos-francesas, em verde e em turquesa.

O script `codigo/arte/cena_sala_moveis.py` monta e renderiza a cena. Cada peça entra com posição e giro, e os objetos
pequenos pousam sozinhos na superfície de baixo (um raio acha o tampo, a prateleira ou o nicho). Ele também grava o
`.blend`.

```bash
AMOSTRAS=128 RES=2000 blender-venv/bin/python -I codigo/arte/cena_sala_moveis.py -- <moveis_out> <construcao> <saida.png> [saida.blend]
```

A página mostra a cena com as 71 peças em miniatura, e clicar numa delas abre a peça no visor.

## Convenções

- **Origem:**
  - peças de chão: no chão, no meio da peça;
  - peças de parede: no plano da parede, na base da peça;
  - peças de teto: no ponto de fixação.
- **Cores:** uma textura só, a paleta de 16 × 16 (`atlas`). Cada face aponta para uma cor. Fora dela há só `vidro`,
  `espelho`, `luz` e as estampas dos quadros e das telas.
- **Interativos:** cada porta, gaveta ou tampa é um objeto filho com a origem no pivô. Os dados vão nos extras do glTF,
  em eixos glTF:
  - `{"interativo": "porta", "eixo": [...], "angulo": rad}`;
  - `{"interativo": "gaveta" | "correr", "direcao": [...], "curso": m}`.
  As gavetas são caixas de verdade, e o corpo dos armários é oco, com prateleiras.
- **Slots:** vazios `slot_*` com `tamanho` (largura, altura livre e profundidade). O de gaveta é filho da gaveta e
  anda com ela.
- **Colisão:** caixas simples no catálogo. As peças com vão (mesa, cadeira, cama alta, estante aberta, sofá em L) têm
  várias caixas, para deixar o vão livre.

## Gerar de novo

A base comum é `codigo/arte/moveis_base.py`, e o guia que os geradores seguem é `codigo/arte/GUIA_MOVEIS.md`. Cada
grupo de categorias tem um gerador em `codigo/arte/`:

| Gerador | Categorias |
|---|---|
| `moveis_armarios.py` | armários, estantes, sapateiras e racks |
| `moveis_quarto.py` | camas e criados |
| `moveis_sala.py` | sofás, pufes e lareiras |
| `moveis_cadeiras.py` | cadeiras |
| `moveis_mesas.py` | mesas |
| `moveis_banheiro.py` | banheiro |
| `moveis_cozinha.py` | módulos de cozinha |
| `moveis_cozinha_eletros.py` | eletros |
| `moveis_decoracao.py` | quadros, tapetes e plantas (as estampas vêm de `moveis_decoracao_estampas.py`) |
| `moveis_objetos.py` | objetos, livros e luminárias |

```bash
MOVEIS_THREADS=2 MOVEIS_PACOTE_FBX=<pacote>/Separate_Assets_fbx MOVEIS_PACOTE_TEX=<pacote>/Textures_4.png blender-venv/bin/python -I codigo/arte/moveis_<grupo>.py -- <saida> [categoria|ids]
```

Depois, para refazer as miniaturas com a luz padrão a partir dos GLB e empacotar para a página:

```bash
blender-venv/bin/python -I codigo/ferramentas/miniaturas_moveis.py -- codigo/arte <saida> - <categorias...>
```

```bash
python3 -I codigo/ferramentas/moveis_pacote.py <SP>
```

Para conferir a biblioteca inteira lendo os GLB (interativos, espaços, colisão, apoio no chão, miniaturas, ids):

```bash
python3 -I codigo/ferramentas/audita_moveis.py <saida> <saida>/auditoria.json
```

Na última rodada, a auditoria não acusou nenhum erro. Ficaram 21 avisos, todos conferidos à vista e intencionais:

- as portas dos boxes curvos deslizam pela curva;
- as miniaturas dos chuveiros e dos cabideiros são finas porque a peça é fina;
- a torneira do canto com pia fica acima da colisão;
- a colisão das plantas grandes é o vaso e o tronco.

`moveis_complementos.py` gera as peças que completaram a lista: mesas infantis e de jardim, tubos de chaminé, grills,
saleiro e pimenteiro, notebook e computador de mesa.

A página também troca as cores de cada peça (escolha uma cor da peça e outra no seletor). Isso funciona porque tudo usa
o mesmo atlas de 16 × 16.

O empacotador junta os GLB de cada categoria num pacote em gzip e base64 e as miniaturas num sprite. Ele para com erro se
faltar a miniatura de alguma peça.
